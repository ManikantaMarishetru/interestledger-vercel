InterestLedger - ready-to-upload website folder
================================================

This folder is the finished app. Nothing needs to be built.

Upload to Vercel (any account):
  Option A - website:
    1. Put this folder in its own GitHub repository (all files at the top level).
    2. On vercel.com: Add New > Project > import that repository.
    3. Framework Preset: "Other". Leave Build Command and Output Directory empty.
    4. Deploy. The address Vercel gives you is the shareable link.
  Option B - command line (in this folder):
    vercel deploy --prod

After opening the link once, the app works offline and can be installed:
  Android Chrome: menu > "Add to Home screen" / "Install app".
  PC Chrome or Edge: the install icon in the address bar.

Each person's records are stored only in their own browser on their own device.
Nothing is sent to Vercel or anywhere else. Use Menu > Backup to save a file.
