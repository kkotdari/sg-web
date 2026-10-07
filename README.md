# sg-web

**Stargate** — 스타크래프트: 리마스터 동호회의 클럽 대항전 전적 관리 웹 앱입니다.

React 19 · TypeScript · Vite · Zustand

## 실행

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 타입 검사 + 프로덕션 빌드
```

백엔드는 [sg-api](../sg-api)입니다. 주소는 `.env.local`에서 바꿉니다.

| 변수 | 설명 | 기본값 |
|---|---|---|
| `VITE_API_BASE` | API 서버 주소 | `http://localhost:8000` |
| `VITE_KAKAO_JS_KEY` | 카카오 공유용 JavaScript 키 | 없음 |

리플레이 재생기는 [scplay](https://github.com/kkotdari/scplay) 패키지를 씁니다. `npm run scplay`로 최신 버전을 받습니다.
