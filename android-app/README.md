# 스타게이트 안드로이드 앱

Capacitor 웹뷰 앱이에요. 사이트(`https://sg8.vercel.app/`, 홈 화면)를 그대로 열어요.

- **모델 그림 내장**: 재생기 폰 아틀라스(약 67MB)를 앱 안에 넣어요. 사이트가 그림을 새로 구우면 바뀐 파일만 네트워크로 받아요.
- **푸시 알림**: FCM으로 받아요. 켜고 끄는 건 사이트의 *앱 설정 → 알림*에서 해요.
- **새 판 알림**: 앱이 깃허브 릴리즈의 `version.json`을 보고 새 판이 있으면 알려 주고, [받기]를 누르면 브라우저로 새 APK를 받아요(받은 파일을 눌러 설치). 앱이 직접 설치 창을 띄우던 길은 Play 프로텍트가 '유해한 앱'으로 거는 까닭이라 걷었어요(설치 권한 `REQUEST_INSTALL_PACKAGES` 도 없음).
- **앱 ID**: `com.kkotdari.stargate`

빌드는 GitHub Actions(`.github/workflows/android.yml`)가 해요.
- 브랜치에 `android-app/`을 고쳐 푸시하면 시험 빌드만 돌아요.
- Actions → **Android APK** → **Run workflow**(버전 입력)를 누르면 서명한 APK가 릴리즈로 올라가요.

사이트의 *앱 설정 → 안드로이드 앱 받기*는 아래 주소를 열어요.

    https://github.com/kkotdari/sg-web/releases/latest/download/stargate.apk

---

## 처음 한 번 할 일

### 1. Firebase 프로젝트 (안드 앱 푸시)

1. <https://console.firebase.google.com> → **프로젝트 추가** → 이름 `stargate` → Google 애널리틱스는 꺼도 돼요.
2. 프로젝트 첫 화면에서 **Android 아이콘(앱 추가)** 을 누르고 다음을 넣어요.
   - Android 패키지 이름: `com.kkotdari.stargate` (정확히)
   - 앱 닉네임: 스타게이트
   - SHA-1: 비워 둬요
3. **google-services.json 다운로드** → 이 파일 내용을 GitHub 비밀값 `GOOGLE_SERVICES_JSON`에 넣어요(아래 4).
   나머지 단계(SDK 추가 등)는 *다음 → 콘솔로 이동*으로 건너뛰어요. 코드는 이미 들어 있어요.
4. 서버(sg-api)가 보낼 수 있게 서비스 계정 키를 받아요.
   - ⚙ **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → JSON 파일을 받아요.
   - 이 파일 내용을 Railway sg-api 환경변수 `FCM_SERVICE_ACCOUNT`에 통째로 붙여 넣어요.
   - 이 키는 비밀이에요. 저장소에 올리면 안 돼요.

### 2. 서명 키스토어 (한 번 만들고 영원히 그대로)

⚠ 키스토어를 잃어버리거나 바꾸면, 이미 깔린 앱이 업데이트를 거부해요. 지우고 다시 깔아야 해요. 파일과 비밀번호를 안전한 곳에 백업해 두세요.

Windows PowerShell에서 실행해요. JDK가 없으면 먼저 `winget install Microsoft.OpenJDK.21`로 깔고 창을 새로 열어요.

```powershell
keytool -genkeypair -v -keystore stargate.jks -alias stargate -keyalg RSA -keysize 2048 -validity 36500
```

비밀번호를 두 번 묻고, 이름 같은 질문은 아무렇게나 답해도 돼요. 이어서 base64로 바꿔 클립보드에 담아요.

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("stargate.jks")) | Set-Clipboard
```

### 3. Web Push 키 (아이폰 PWA · 브라우저 알림)

```powershell
npx web-push generate-vapid-keys
```

나온 두 줄을 Railway sg-api 환경변수에 넣어요.
- Public Key → `VAPID_PUBLIC_KEY`
- Private Key → `VAPID_PRIVATE_KEY`

(sg-api 폴더에서 `python -m app.domain.push.webpush`로 뽑아도 같은 꼴이에요.)

### 4. GitHub 비밀값

sg-web 저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 2의 base64 (클립보드) |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `ANDROID_KEY_ALIAS` | `stargate` |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 (따로 안 정했으면 키스토어 비밀번호와 같음) |
| `GOOGLE_SERVICES_JSON` | 1-3의 google-services.json 내용 그대로 |

### 5. 첫 릴리즈

sg-web 저장소 → **Actions → Android APK → Run workflow** → 버전 `1.0.0` → 실행해요.
10분쯤 지나면 Releases에 `stargate.apk`가 올라가고, 사이트의 *앱 설정 → 받기*가 바로 그 파일을 받아요.

다음 판부터는 같은 버튼에 더 큰 버전(`1.0.1` …)을 넣어요. 앱을 열면 업데이트 창이 떠요.

---

## 아이폰

앱 대신 PWA로 써요. 사파리에서 사이트를 열고 **공유 → 홈 화면에 추가**를 한 뒤, 홈 화면 아이콘으로 열어 *앱 설정 → 알림*을 켜요(iOS 16.4 이상). 사파리 탭에서는 웹 푸시가 안 돼요.
