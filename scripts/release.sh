#!/usr/bin/env bash
set -e

# 치지직 클린 자동 릴리즈 배포 스크립트
# 사용법: npm run release [버전] [수정사항 요약]
# 예시: npm run release 2.0.2 "버그 수정 및 성능 개선"

VERSION=$1
CHANGELOG=$2

if [ -z "$VERSION" ]; then
  # package.json에서 버전 읽기
  VERSION=$(node -p "require('./package.json').version")
fi

TAG="v$VERSION"
ZIP_NAME="chzzk-clean-${TAG}.zip"

echo "========================================================"
echo "  치지직 클린 (Chzzk Clean) ${TAG} 릴리즈 배포 시작"
echo "========================================================"

# 1. 빌드 수행
echo "[1/4] 프로젝트 빌드 중..."
npm run build

# 2. 배포용 ZIP 압축
echo "[2/4] 배포용 패키지 (${ZIP_NAME}) 압축 중..."
rm -f "$ZIP_NAME"
(cd dist && zip -r "../$ZIP_NAME" . > /dev/null)
echo "  -> ${ZIP_NAME} 생성 완료 ($(du -h "$ZIP_NAME" | cut -f1))"

# 3. Git 커밋 및 태그 푸시
echo "[3/4] Git 태그 푸시 중..."
git add .
git commit -m "release: ${TAG}" || true
git push origin main
if git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag -d "$TAG"
  git push --delete origin "$TAG" || true
fi
git tag "$TAG"
git push origin "$TAG"

# 4. GitHub Release 생성 및 업로드
echo "[4/4] GitHub Releases에 등록 중..."
NOTES_FILE="RELEASE_NOTES_TMP.md"

if [ -n "$CHANGELOG" ]; then
  cat <<EOF > "$NOTES_FILE"
# ⚡️ 치지직 클린 (Chzzk Clean) ${TAG}

### 🚀 수정 및 개선 사항
${CHANGELOG}

### 📦 설치 및 업데이트 방법
1. 아래 첨부파일 중 **\`${ZIP_NAME}\`**을 다운로드하여 압축을 풉니다.
2. 크롬 \`chrome://extensions\`에서 압축을 푼 폴더를 로드하거나 새로고침합니다.
3. 기존 사용자는 폴더 내의 **\`update.bat\`**을 더블클릭하시면 자동 업데이트됩니다.
EOF
else
  cat <<EOF > "$NOTES_FILE"
# ⚡️ 치지직 클린 (Chzzk Clean) ${TAG}

치지직 그리드(P2P) 원천 우회, 1080p 최고 화질 고정, 동영상 광고 스킵 및 방해 팝업 차단 확장프로그램입니다.

### 📦 설치 및 업데이트 방법
1. 아래 첨부파일 중 **\`${ZIP_NAME}\`**을 다운로드하여 압축을 풉니다.
2. 크롬 \`chrome://extensions\`에서 압축을 푼 폴더를 로드하거나 새로고침합니다.
3. 기존 사용자는 폴더 내의 **\`update.bat\`**을 더블클릭하시면 자동 업데이트됩니다.
EOF
fi

gh release create "$TAG" "$ZIP_NAME" --title "치지직 클린 ${TAG} (Chzzk Clean)" --notes-file "$NOTES_FILE" || \
gh release upload "$TAG" "$ZIP_NAME" --clobber

rm -f "$NOTES_FILE"

echo ""
echo "========================================================"
echo "  🎉 ${TAG} 릴리즈 배포가 성공적으로 완료되었습니다!"
echo "  URL: https://github.com/Yeonjaewoo/allinone-2.0/releases/tag/${TAG}"
echo "========================================================"
