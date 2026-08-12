# 마중물 MINISTRY — 구글 VM 배포 가이드

기존에 운영 중인 `https://oci-crm.duckdns.org/` 및 `/prospect/` 서비스와 **완전히 분리된 포트(3100)** 로 구동됩니다. 기존 서비스의 nginx/아파치/앱 설정은 전혀 건드리지 않습니다.

## 구조

```
majungmul-app/
├─ server.js            # Express 웹/API 서버 (기본 포트 3100)
├─ package.json
├─ majungmul.service    # systemd 상시구동 설정
├─ public/              # 빌드된 프론트엔드 (index.html, app.js)
├─ src/                 # 프론트 소스 (수정 시 npm run build)
└─ data/                # 데이터 저장소 (*.json — 자동 생성, 백업 대상)
```

- DB 설치 불필요: 데이터는 `data/*.json` 파일에 원자적 쓰기로 저장됩니다.
- 개인정보 보호: 접수건의 담당자 이름·연락처는 서버에서 마스킹되어 비관리자에게 내려갑니다.
- 관리자 인증: 서버 발급 토큰 방식. 비밀번호는 환경변수 `ADMIN_PASSWORD`로 관리.

## 1. 파일 업로드

로컬에서 VM으로 압축 파일을 올립니다 (또는 GCP 콘솔 SSH의 파일 업로드 사용):

```bash
scp majungmul-app.zip YOUR_USERNAME@VM_IP:~/
```

VM에서:

```bash
cd ~ && unzip majungmul-app.zip && cd majungmul-app
```

## 2. Node.js 확인 및 의존성 설치

```bash
node -v          # v18 이상 권장. 없으면: sudo apt install -y nodejs npm
npm install --omit=dev
```

프론트는 이미 빌드되어(public/app.js) 있으므로 별도 빌드는 필요 없습니다.
소스를 수정한 경우에만 `npm install` 후 `npm run build`를 실행하세요.

## 3. 포트 충돌 확인 (기존 서비스 보호)

```bash
sudo ss -tlnp | grep -E ':(80|443|3100)\b'
```

- 80/443: 기존 oci-crm 이 사용 중 → 건드리지 않음
- 3100 이 이미 사용 중이라면 다른 포트로 변경: `PORT=3200` 등 (아래 서비스 파일에서 수정)

## 4. 방화벽 개방 (GCP)

GCP 콘솔 → VPC 네트워크 → 방화벽 → 규칙 만들기:

- 대상: 해당 VM (또는 태그)
- 소스 IP 범위: `0.0.0.0/0`
- 프로토콜/포트: `tcp:3100`

또는 gcloud CLI:

```bash
gcloud compute firewall-rules create allow-majungmul \
  --allow=tcp:3100 --direction=INGRESS --source-ranges=0.0.0.0/0
```

## 5. 동작 테스트

```bash
PORT=3100 ADMIN_PASSWORD='새비밀번호로변경' node server.js
# 브라우저에서 http://VM_외부IP:3100 접속 확인 후 Ctrl+C
```

## 6. 상시 구동 등록 (systemd)

`majungmul.service` 파일을 열어 `YOUR_USERNAME`, 경로, `ADMIN_PASSWORD`를 수정한 뒤:

```bash
sudo cp majungmul.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now majungmul
sudo systemctl status majungmul     # 상태 확인
journalctl -u majungmul -f          # 로그 보기
```

## 7. (선택) 도메인 + HTTPS 연결

포트 분리 원칙은 유지한 채, 기존 nginx에 **별도 server 블록만 추가**하면
`https://majungmul.duckdns.org` 같은 주소로 서비스할 수 있습니다.
기존 두 사이트 설정은 수정하지 않습니다.

1. duckdns.org 에서 서브도메인(예: `majungmul`)을 VM IP로 추가
2. `/etc/nginx/sites-available/majungmul` 생성:

```nginx
server {
    listen 80;
    server_name majungmul.duckdns.org;   # 새 도메인 전용 블록

    location / {
        proxy_pass http://127.0.0.1:3100;   # 내부적으로 3100 포트로 전달
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. 활성화 및 인증서 발급:

```bash
sudo ln -s /etc/nginx/sites-available/majungmul /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d majungmul.duckdns.org
```

## 8. 백업

접수·게시물 데이터 전체는 `data/` 폴더 하나만 백업하면 됩니다:

```bash
tar czf majungmul-backup-$(date +%F).tar.gz data/
```

## 보안 체크리스트

- [ ] `ADMIN_PASSWORD` 기본값(`majungmul!`)을 강한 비밀번호로 변경했는가
- [ ] GCP 방화벽에서 3100 포트만 추가 개방했는가 (다른 포트 변경 없음)
- [ ] `data/` 폴더 정기 백업을 걸어두었는가
