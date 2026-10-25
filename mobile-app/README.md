# Spelling Games: phone and tablet app

This folder turns the website version (`../crossword`) into an Android app with
[Capacitor](https://capacitorjs.com/). The app is the same games, with these differences:

- Words are read aloud with the phone's own text-to-speech engine, because Android apps can't use the browser's speech.
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

## iPhone and iPad

The easiest option is the website version: open it in Safari, tap **Share**, then
**Add to Home Screen**. It gets an icon, opens full screen and works offline.

To make a real iOS app you need a Mac with Xcode:

```bash
cd mobile-app
npm install
npm install --save-exact @capacitor/ios@8.5.3
npx cap add ios
npm run sync
npx cap open ios
```

Publishing on the App Store needs an Apple Developer account.

## Changing the icon

The icons in `android/app/src/main/res/mipmap-*` and splash screens in `drawable*/splash.png` were
generated from the same design as `crossword/icons/`. Replace those PNG files to change them.
