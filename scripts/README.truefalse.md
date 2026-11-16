# True/False 作問 / Authoring

[True/False利用案内（日英）](../app/tf-webapp/README.md)に、起動・作問・多言語展開・保存形式・検証範囲をまとめています。

```sh
make start
# 作問一覧でTrue/Falseを選択 / Choose True/False in the authoring index
```

TFのみ起動 / TF only:

```sh
make tf-webapp
# http://127.0.0.1:4178/
```

Port override: `TF_WEBAPP_PORT` for managed startup, or `python3 app/tf-webapp/server.py --port 4188`.

## CSVからMoodle XMLへ / Convert CSV to Moodle XML

リポジトリのルートで実行します。入力はTFエディターで保存したCSVです。
Run from the repository root with a CSV saved by the True/False editor.

```sh
python3 scripts/tf_csv2xml.py question.csv question.xml
```

出力には新しいファイル名を指定します。WebAppやMaximaの起動は不要です。
Choose a new output filename. The WebApp and Maxima need not be running.
