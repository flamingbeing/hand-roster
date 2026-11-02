// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (`firebase apps:sdkconfig WEB`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = {"name":"hand-roster","title":"Hand Roster","host":"handroster.anawj.com","accent":"#3a6390"};
export const KIT = 'https://design.anawj.com/v1/';
export const firebaseConfig = {
  "projectId": "hand-roster-app",
  "authDomain": "handroster.anawj.com",
  "apiKey": "AIzaSyB9xG2YfEpdp10vhgKF2l20OnjCMK_yc4A",
  "appId": "1:235091817766:web:e1e8133ea1fd29d1737de7",
  "storageBucket": "hand-roster-app.firebasestorage.app",
  "messagingSenderId": "235091817766"
};
