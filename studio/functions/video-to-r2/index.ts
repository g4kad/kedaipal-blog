import {documentEventHandler} from '@sanity/functions'
import {createClient} from '@sanity/client'
import {AwsClient} from 'aws4fetch'

// Copies videos uploaded in the Studio to Cloudflare R2 and saves the public R2 link
// on each video block (`r2Url`). The blog then plays the R2 copy, so views don't use
// Sanity bandwidth. The R2 key lives only in this Function's environment variables:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
// (optional R2_ENDPOINT overrides the S3 endpoint, used for local testing)

interface Video {
  _key: string
  url: string
  assetId: string
  ext?: string
  mime?: string
  size?: number
}

interface PostVideos {
  _id: string
  videos?: Video[]
}

const env = (name: string) => process.env[name]?.trim() || ''
const trimSlash = (s: string) => s.replace(/\/+$/, '')

export const handler = documentEventHandler<PostVideos>(async ({context, event}) => {
  const {_id, videos = []} = event.data
  if (!videos.length) return

  const accountId = env('R2_ACCOUNT_ID')
  const accessKeyId = env('R2_ACCESS_KEY_ID')
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY')
  const bucket = env('R2_BUCKET')
  const publicUrl = trimSlash(env('R2_PUBLIC_URL'))
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    // Not set up yet: the video keeps playing from Sanity, nothing breaks
    console.log('R2 is not configured yet, so videos stay on Sanity. See studio/R2-VIDEO-SETUP.md')
    return
  }

  const endpoint = trimSlash(env('R2_ENDPOINT') || `https://${accountId}.r2.cloudflarestorage.com`)
  const r2 = new AwsClient({accessKeyId, secretAccessKey, service: 's3', region: 'auto'})
  const set: Record<string, string> = {}

  for (const video of videos) {
    // Sanity file asset ids look like "file-<sha1>-<ext>"; the sha1 makes a stable, unique name
    const hash = video.assetId.replace(/^file-/, '').replace(/-[a-z0-9]+$/i, '')
    const ext = (video.ext || 'mp4').toLowerCase()
    const name = `videos/${hash}.${ext}`
    const objectUrl = `${endpoint}/${bucket}/${name}`

    const existing = await r2.fetch(objectUrl, {method: 'HEAD'})
    if (existing.ok) {
      console.log(`${name} is already on R2, reusing it`)
    } else {
      const source = await fetch(video.url)
      if (!source.ok) throw new Error(`Could not download ${video.url} (${source.status})`)
      const body = await source.arrayBuffer()
      const put = await r2.fetch(objectUrl, {
        method: 'PUT',
        body,
        headers: {
          'Content-Type': video.mime || 'video/mp4',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
      if (!put.ok) throw new Error(`R2 upload failed for ${name} (${put.status}): ${await put.text()}`)
      console.log(`Uploaded ${name} (${(body.byteLength / 1048576).toFixed(1)} MB)`)
    }
    set[`body[_key=="${video._key}"].r2Url`] = `${publicUrl}/${name}`
  }

  if (context.local) {
    console.log('Local test: would save', JSON.stringify(set))
    return
  }

  // Save the links on the published post, and on any open draft so the next publish keeps them
  const client = createClient({apiVersion: '2025-02-19', useCdn: false, ...context.clientOptions})
  await client.patch(_id).set(set).commit()
  const draft = await client.getDocument(`drafts.${_id}`)
  if (draft) await client.patch(draft._id).set(set).commit()
  console.log(`Saved R2 links on ${_id}`)
})
