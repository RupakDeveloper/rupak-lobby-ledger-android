# Rupak Lobby Ledger — Android app source

A private esports hosting ledger for Rupak Nath. Built with React + Capacitor + Firebase.

## Included features
- Email/password account login.
- Cloud-synced daily lobby entries and payment records.
- Default ₹10 per lobby; custom rate can be changed at any time.
- Each saved entry keeps its original rate, so changing the rate does not rewrite old earnings.
- Earnings, received amount, pending balance and total lobby dashboard.
- Date-filtered admin statement with PDF and PNG export/share.
- Upload, replace and remove personal UPI/payment QR image (stored in the user's private Firestore settings document; image limit 650 KB).
- Optional QR inclusion toggle for statement exports.
- Android share sheet support (WhatsApp etc.) where supported.

## Important accounting note
The statement's net due is calculated from the lobby entries and payments that fall inside the selected date range. The dashboard pending amount is lifetime total earned minus lifetime payments received. For a clean admin statement, choose a date range covering the period you want to claim.

## 1. Create Firebase project (free tier)
1. Go to https://console.firebase.google.com and create a project.
2. In Project settings, add a Web App and copy its Firebase config.
3. Authentication → Sign-in method → enable Email/Password.
4. Firestore Database → Create database.
6. Copy `.env.example` to `.env` and replace each value with your Firebase config.
7. In Firebase Console → Firestore Rules, paste `firestore.rules` and Publish.

The QR image is stored in your private Firestore settings document to avoid needing Firebase Storage setup. Keep the QR image under 650 KB.

## 2. Run locally
Install Node.js LTS, then in this project folder:

```bash
npm install
npm run dev
```

## 3. Build Android APK
You need a computer with Android Studio installed (Android SDK included), Node.js LTS, and Java 17.

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to finish.
2. Select Build → Build Bundle(s) / APK(s) → Build APK(s).
3. When complete, click the notification's Locate link.
4. The debug APK is normally at `android/app/build/outputs/apk/debug/app-debug.apk`.

For a shareable release APK: Build → Generate Signed Bundle / APK → APK, create and safely back up your keystore, then finish the wizard. Do not share your keystore or passwords.

## 4. Future updates
After changing app source:

```bash
npm run android:sync
```

Then rebuild the APK from Android Studio.

## App identity
- App name: Rupak Lobby Ledger
- Android application ID: `com.rupak.lobbyledger`
- Account owner display name in statement: Rupak Nath

## Security
Firestore rules restrict each signed-in user to their own `/users/{uid}/...` records. Never publish your Firebase service account private key in this project. The Firebase web config is intended for client apps; security is enforced by Firebase Rules.
