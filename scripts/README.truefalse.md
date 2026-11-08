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
