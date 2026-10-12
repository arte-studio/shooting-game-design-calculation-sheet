#!/bin/sh
# バージョン表示とキャッシュ回避用クエリを更新する（コミット前に実行）
# 版番号 = この変更を含めたコミット数, 日付 = 今日
set -e
cd "$(dirname "$0")"
N=$(( $(git rev-list --count HEAD) + 1 ))
D=$(date +%F)
sed -i -E "s/(style\.css|gearcore\.js|app\.js)\?v=[0-9]+/\1?v=$N/g; s|<span id=\"ver\"([^>]*)>[^<]*</span>|<span id=\"ver\"\1>v$N · $D</span>|" index.html
echo "v$N · $D"
