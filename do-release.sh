fail()
{
	echo "$1" 1>&2
	exit 1
}

git diff-index --quiet HEAD -- || fail "Release builds must not have unstaged changes!"

rm moonlight-chrome.zip
make clean || fail "Clean failed"
make -j$(nproc) || fail "Build failed"


zip moonlight-chrome.zip -r . -i pnacl/Release/moonlight-chrome.* -i manifest.json -i index.html -i LICENSE || fail "Zip failed"
zip moonlight-chrome.zip -r icons || fail "Zip failed"
zip moonlight-chrome.zip -r static || fail "Zip failed"