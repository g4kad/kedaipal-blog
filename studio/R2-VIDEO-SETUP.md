# Video hosting on Cloudflare R2 (one-time setup)

Editors upload videos in the Studio as usual (**Video** block → **Upload a video**) and publish.
A Sanity Function (`video-to-r2`) then copies each uploaded video to Cloudflare R2 and saves
the public R2 link on the video block. The blog plays the R2 copy, so views cost nothing and
don't use Sanity bandwidth.

- The R2 key is stored only as a Sanity Function environment variable. It is never in the
  Studio, the website or this repository.
- Until this setup is done, the Function does nothing and videos simply play from Sanity.

```
Editor uploads + publishes ──▶ Sanity Function (video-to-r2) ──▶ copies file to R2
                                       │
                                       └──▶ saves r2Url on the video block ──▶ blog plays from R2
```

Files: `sanity.blueprint.ts` (when the Function runs) and `functions/video-to-r2/index.ts` (what it does).

---

## 1. Cloudflare (about 10 minutes)

1. **R2 → Create bucket**, e.g. `kedaipal-media`.
2. Bucket **Settings → Custom Domains → Connect Domain**, e.g. `media.kedaipal.com`
   (the zone must be on the same Cloudflare account). Avoid the `r2.dev` URL for production.
3. **R2 → Manage API tokens → Create API token**
   - Permissions: **Object Read & Write**
   - Apply to: **this bucket only**
   - Note the **Access Key ID** and **Secret Access Key** (shown once) and your **Account ID**.

No R2 CORS rules are needed: uploads happen server-side, and `<video>` playback doesn't require CORS.

## 2. Sanity (about 10 minutes), from the `studio/` folder

Use an account with **Administrator** access to project `cvycqoxz`.

```bash
cd studio
npm install
npx sanity login

# Link this Blueprint to the project (creates a Stack and a .sanity/ config file).
# If it asks to create or overwrite sanity.blueprint.ts, keep ours; if it was replaced, restore it:
npx sanity blueprints init . --project-id cvycqoxz --stack-name production
git checkout -- sanity.blueprint.ts

# Preview, then deploy the Function
npx sanity blueprints plan
npx sanity blueprints deploy

# Add the R2 settings (values are stored privately; `env list` only shows names)
npx sanity functions env add video-to-r2 R2_ACCOUNT_ID        "<account id>"
npx sanity functions env add video-to-r2 R2_ACCESS_KEY_ID     "<access key id>"
npx sanity functions env add video-to-r2 R2_SECRET_ACCESS_KEY "<secret access key>"
npx sanity functions env add video-to-r2 R2_BUCKET            "kedaipal-media"
npx sanity functions env add video-to-r2 R2_PUBLIC_URL        "https://media.kedaipal.com"
```

Commit the `.sanity/` folder that `blueprints init` created, so future deploys target the same Stack.

## 3. Test

1. In the Studio, add a **Video** block with an uploaded MP4 to a post and **Publish**.
2. Watch the Function: `npx sanity functions logs video-to-r2`
   You should see `Uploaded videos/<hash>.mp4 (… MB)` then `Saved R2 links on <post id>`.
3. Reopen the post: the video block now shows **Hosted on Cloudflare R2** with the link,
   and the block's preview reads **✓ Hosted on R2**.

## How it behaves

| Situation | Result |
|---|---|
| R2 settings not added yet | Function does nothing; video plays from Sanity |
| Video already on R2 (same file re-published) | Reuses the existing file, no re-upload |
| Video only linked (no upload) | Ignored; nothing to copy |
| Wrong/expired key | Function logs an R2 error; video keeps playing from Sanity |

- Files are stored as `videos/<sanity-file-hash>.<ext>` and cached for a year (`immutable`).
- Limits: up to 15 minutes and 2 GB memory per run (set in `sanity.blueprint.ts`).
  Compressed web videos are far below this.
- The original upload stays in Sanity (storage only). It can be removed later if storage matters.

## Changing things later

- Rotate the key: create a new R2 token, then run `functions env add` again with the new values.
- Change the Function: edit the files, then `npx sanity blueprints deploy`.
- Remove it: `npx sanity blueprints destroy` (videos then play from Sanity again for new uploads).
