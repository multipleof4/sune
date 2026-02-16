[![Download For Android (.apk)](https://img.shields.io/badge/Download-For%20Android%20(.apk)-green?style=for-the-badge&logo=android)](https://github.com/multipleof4/sune/releases/download/v0.23.0/sune-v0.23.0.apk)

![Main](./public/appstore_content/screenshot1.jpg)

> Each sune is like a module. You can have many. And share them.

![Sunes](./public/appstore_content/screenshot6.jpg)

![Setting](./public/appstore_content/screenshot3.jpg)

💠 New! 

> You can have scripts which run on the page of each sune — either to function call or extend functionality of the app or sune.

![Scripting](./public/appstore_content/screenshot4.jpg)

> Image support.

![Miku](./public/appstore_content/screenshot_miku.png)

> There is a marketplace.

![Marketplace](./public/appstore_content/screenshot_marketplace.jpg)

> LaTeX support out of the box.

![LaTeX](./public/appstore_content/latex.png)

---

## 🔄 Sync Your Chats with GitHub

Never lose a conversation again. Sune can sync all your threads to a GitHub repo.

![Sync](./public/appstore_content/sync.png)

### Setup

1. **Create a GitHub repo** — can be private or public, whatever you prefer. Something like `.chats`.

2. **Generate a Personal Access Token (PAT)**
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Classic Token** → **Generate new token**
   - Give it **Read and write** access to **Contents** on your repo
   - Copy the token

3. **Add your token in Sune**
   - Open the left sidebar → **Account & Backup** → **Settings**
   - Go to the **API** tab
   - Paste your token into the **Github Token** field
   - Hit **Save**

4. **Point Sune to your repo**
   - Open the right sidebar (Threads panel)
   - In the repo input at the top, enter: `gh://your-username/.chats`
   - Press Enter

5. **Sync**
   - Hit the **Sync** button after starting a new chat in there.
   - **OK** = Push your local threads up to GitHub
   - **Cancel** = Pull threads down from GitHub

That's it. Your threads are now backed up as JSON files in your repo. You can sync across devices, never lose a chat, and even browse your conversations directly on GitHub.
