# 기여 안내

## 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 형식을 따르고, 설명은 한국어로 쓴다.

```
<type>(<scope>): <요약>

<본문 — 선택>
```

### type

| type | 쓰는 때 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작은 그대로 두고 구조만 바꿈 |
| `perf` | 성능 개선 |
| `style` | 포맷·공백·세미콜론처럼 동작과 무관한 손질 |
| `docs` | 문서 |
| `test` | 테스트 추가·수정 |
| `build` | 빌드 설정·의존성 |
| `ci` | CI 설정 |
| `chore` | 그 밖의 잡일 |
| `revert` | 이전 커밋 되돌림 |

### 규칙

- type과 scope는 영문 소문자로 쓴다. scope는 바뀐 영역이며 생략해도 된다. 예: `activity`, `auth`, `game`, `league`, `stats`, `admin`, `api`, `deps`.
- 요약은 한국어로 50자 안팎에서 끝내고, 마침표는 찍지 않는다. 무엇을 했는지 명사형으로 끝맺는다. 예: "숨김 확인창 문구 단순화".
- 본문은 선택이다. 왜, 무엇을 바꿨는지 한국어로 적고, 여러 항목이면 `- `로 나눈다.
- 호환이 깨지는 변경은 `feat!:`처럼 `!`를 붙이고, 본문 끝에 `BREAKING CHANGE: 설명`을 적는다.
- 한 커밋에는 한 가지 일만 담는다.

### 예시

```
feat(activity): 손님 입장과 외부 공개 게임 목록 추가
fix(game): 숨긴 경기가 운영자에게 열리던 문제 수정
refactor(api): 경기 응답 짓는 함수 정리
style: 불필요한 공백 정리
build(deps): scplay 갱신
```
