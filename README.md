# AS - PFP THAT SHAPES YOU!

Heroku-deployable web app that connects a WhatsApp account using **Baileys** (QR scan or pairing code), then uploads an image and updates profile photo.

## Features
- QR + pairing code sign-in.
- iOS-inspired UI.
- Accepts any aspect ratio upload and force-fits to 640x640 for WhatsApp PFP update.
- Ready for Heroku stack `heroku-24`.

## Local Run
```bash
npm install
npm start
```
Open `http://localhost:3000`.

## Deploy to Heroku
1. Create app and ensure stack is heroku-24.
2. Push repo.
3. Scale web dyno.

## Notes
- Sessions are stored in `/tmp`, which is ephemeral on Heroku.
- WhatsApp/Baileys may change restrictions; keep dependencies updated.
