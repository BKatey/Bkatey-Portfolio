# Spelling Games: phone and tablet apps

This folder turns the website version (`../crossword`) into Android and iOS apps with
[Capacitor](https://capacitorjs.com/). The app is the same games, with these differences:

- Words are read aloud with the device's own text-to-speech engine, which works more reliably inside an app than the browser's speech.
- It works offline, and fonts and icons are built in.
- "Record me" asks for microphone permission the first time it's used.
- Printing and the "Back to portfolio" link are hidden.

## Get the Android app without installing anything

Every push that changes `crossword/` or `mobile-app/` runs the **Android app** workflow on GitHub.

1. Open the repository's **Actions** tab, then the latest **Android app** run.
2. Under **Artifacts**, download **spelling-games-android-apk** and unzip it to get `app-debug.apk`.
3. Copy it to an Android phone or tablet and open it. Allow "Install unknown apps" for your file manager or browser when asked.

This is a test ("debug") build, which is fine for your own family or classroom. Putting it on the
Google Play Store needs a signed release build and a Google Play developer account.

## Building on your own computer

You need [Node.js 22](https://nodejs.org/), Java 21 and [Android Studio](https://developer.android.com/studio).

```bash
cd mobile-app
npm install
npm run android   # copies the web app in and opens the project in Android Studio
```

In Android Studio, press **Run** to install it on a connected phone or an emulator.
To build an APK from the command line instead, run `npm run apk`.

**Whenever you change files in `crossword/`, run `npm run sync` again** so the app gets the new version.

## iPhone and iPad app

The iOS project is in `ios/`. The **iOS app** workflow on GitHub builds it on every push to make
sure it compiles. Apple only lets signed apps run on real iPhones, so there are three ways to get it
onto a device:

### 1. Quickest, free: add the website to the Home Screen

Open the website version in Safari, tap **Share**, then **Add to Home Screen**. It gets the app icon,
opens full screen and works offline. This needs the site to be published with GitHub Pages first.

### 2. TestFlight (recommended for family or a class): no Mac needed

You need an [Apple Developer Program](https://developer.apple.com/programs/) membership (US$99 a year).

1. In [App Store Connect](https://appstoreconnect.apple.com/), go to **Apps → +**, choose **New App** and
   use the bundle ID `com.bkatey.spellinggames`. If that ID isn't offered, register it first under
   **Certificates, Identifiers & Profiles → Identifiers**.
2. In App Store Connect, go to **Users and Access → Integrations → App Store Connect API**. Create a key
   with the **App Manager** role, download the `.p8` file, and note the **Key ID** and **Issuer ID**.
3. Find your **Team ID** under **Membership details** at <https://developer.apple.com/account>.
4. In this GitHub repository, open **Settings → Secrets and variables → Actions** and add these secrets:
   - `APPLE_TEAM_ID`: your Team ID
   - `ASC_KEY_ID`: the Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_KEY_P8_BASE64`: the `.p8` file encoded as base64. On a Mac run `base64 -i AuthKey_XXXX.p8 | pbcopy`;
     on Windows PowerShell run `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8")) | Set-Clipboard`.
     Then paste the result.
5. Open **Actions → iOS app → Run workflow**, tick **Upload to TestFlight**, and run it.
6. After Apple processes the build (usually 10 to 30 minutes), add testers in App Store Connect under
   **TestFlight**. They install the free **TestFlight** app on their iPhone or iPad and open the invite.

From TestFlight you can also submit the app for review to publish it on the App Store.

### 3. With a Mac and Xcode

```bash
cd mobile-app
npm install
npm run sync
npx cap open ios
```

In Xcode, select the **App** target, open **Signing & Capabilities** and choose your team (a free
Apple ID works for your own device, but the app expires after 7 days). Connect the iPhone and press **Run**.

### Simulator build

Each **iOS app** workflow run also uploads **spelling-games-ios-simulator-app**: the app built for the iOS
Simulator on a Mac (unzip it and drag `App.app` onto a running simulator). It can't be installed on a real iPhone.

## Changing the icon

The icons and splash screens were generated from the same design as `crossword/icons/`.
To change them, replace these PNG files:

- Android: `android/app/src/main/res/mipmap-*` and `drawable*/splash.png`
- iOS: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (1024×1024, no transparency) and `Splash.imageset/`
