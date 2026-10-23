import {defineBlueprint, defineDocumentFunction} from '@sanity/blueprints'

// Sanity Functions: small backend jobs that run on Sanity's servers.
// Deploy (one time, then after changes): npx sanity blueprints deploy
// Setup guide: R2-VIDEO-SETUP.md
export default defineBlueprint({
  resources: [
    defineDocumentFunction({
      name: 'video-to-r2',
      // When a post with a not-yet-copied uploaded video is published,
      // copy the video to Cloudflare R2 and save the R2 link on the video block
      event: {
        on: ['publish'],
        filter: '_type == "post" && count(body[_type == "video" && defined(file.asset) && !defined(r2Url)]) > 0',
        projection:
          '{_id, "videos": body[_type == "video" && defined(file.asset) && !defined(r2Url)]{_key, "url": file.asset->url, "assetId": file.asset->_id, "ext": file.asset->extension, "mime": file.asset->mimeType, "size": file.asset->size}}',
        resource: {type: 'dataset', id: 'cvycqoxz.production'},
      },
      timeout: 900, // seconds; enough to copy large videos
      memory: 2, // GB
    }),
  ],
})
