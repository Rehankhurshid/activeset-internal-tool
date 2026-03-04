# Project Links Mobile (Flutter)

Flutter app for iOS and Android that wraps the Project Links web app in a native WebView.

## Default URL

The app loads:

`https://app.activeset.co/modules/project-links`

You can override it at build/run time via `--dart-define`.

## Run

```bash
cd mobile/project_links_mobile
flutter pub get
flutter run --dart-define=WEBAPP_URL=https://app.activeset.co/modules/project-links
```

## Build

```bash
cd mobile/project_links_mobile
flutter build apk --dart-define=WEBAPP_URL=https://app.activeset.co/modules/project-links
flutter build ios --dart-define=WEBAPP_URL=https://app.activeset.co/modules/project-links
```

## Notes

- App handles in-WebView navigation for `http/https`.
- External schemes (`mailto:`, `tel:`, etc.) are opened with native apps.
- Android Internet permission is enabled.
- iOS allows local HTTP loads for `localhost` and `127.0.0.1` to support local web app testing.
