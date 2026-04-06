#!/bin/bash

infile="$1"
[ ! -f $infile ] && exit 1

outfile="${infile%.txt}.mac"

perl -0pe '
  s@/\*.*?\*/@@gs;   # コメント削除
  s/\s*\z//;         # 末尾の空行削除
' "$infile" > "$outfile"

echo "出力しました: $outfile" >&2
