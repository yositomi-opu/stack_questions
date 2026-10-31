# Parsons WebApp · PRT-PARSON

STACKの「証明の手順を選び、ドラッグして並べる」Parsons問題を作成・編集するローカルWebアプリです。数学的な証明の正しさそのものを自動推定するアプリではありません。作問者が必要な手順と認める順序を指定します。

## 起動と基本操作

リポジトリーのルートで `make start` を実行し、http://localhost:4177/ を開きます。Python 3.10以降を使用し、追加のPythonパッケージは不要です。単独起動は `python3 app/parsons-webapp/server.py`。既存のポートを変更する場合は `PARSONS_WEBAPP_PORT` を指定します。

1. 問題名と標準言語の問題文を入力します。問題変数の `{@A@}` などをCASTextとして参照できます。
2. 選択肢に手順IDと文章を入力します。IDは翻訳しても同じ値を使います。誤った手順・使わない手順も選択肢に含められます。
3. 正解例をIDの並びで指定します。各選択肢の＋で追加できます。使わない手順は正解例に入れません。
4. 順序の判定方法を選択します。
   - 「正解例と別の正解順序」では、認める完全な並びを追加します。長さの異なる別証明も明示できます。
   - 「前後関係の制約」では、正解例の手順をすべて1回ずつ使い、指定した関係を満たす並びを認めます。例：`s1,s2,s4` と `s1,s3,s4` の2行なら、s2とs3は交換できます。制約モード中は明示した別順序を判定に使いません。
5. 多言語欄で言語を選択し、文章の言語を切り替えて問題文・選択肢・フィードバックを入力します。未選択言語の編集データは保持します。翻訳JSONの作成/反映、MCQと共通設定のAI翻訳も利用できます。AIへの送信はボタンを押した場合だけです。
6. CSV/XMLメニューで読込・表示・保存・上書を行います。上書は対応ブラウザーだけで利用でき、それ以外はダウンロード保存です。XML名は `012.問題名-parsons.xml`、CSV名は `問題名.csv`。作業ZIPには原本XMLと現在のXMLを含め、後で再開できます。

「順序を試す」では、選択肢IDを押して追加し、ドラッグ/↑↓で並べ替えて条件を確認できます。本文はソースとして安全に表示します。これはSTACKの実採点ではありません。MoodleへXMLを取り込んで最終的な表示・採点を確認してください。

## 問題バンクとの連携

新版Moodle Qbankの「＋ Parsons問題」または形式欄の `PRT-PARSON` から開きます。「保存して終了（問題バンクへ戻る）」で編集を返却し、受理後にタブを閉じます。XMLメニューの保存も同じ操作になります。競合・通信失敗・セッション失効時はタブを閉じません。必要ならCSV/作業ZIP、またはXMLの「ファイルに退避」で保管してください。問題バンク側の作業ZIPも別途保存します。単独で開いたアプリの保存先はファイルです。

## 対応するXMLと保存形式

- STACKのParsons入力1つとPRT1つによる平坦な証明を対象にします。単一問題のXML、単一問題のCSV、このアプリの作業ZIPを読み込めます。複数問題入りの配布ZIPは先に展開し、各XMLを開いてください。
- 新規作成時は独自の小さな証明例を表示します。利用者の教材・添付を自動で公開しません。
- 自作XMLには、問題変数内の識別情報として `version:3, mode:parsons` を保存します。Qbankは `PRT-PARSON` として判定します。
- 一部の既存パターンはCASを実行せず静的に読み取ります。`proof`、`proof_c`、`proof_iff` と静的手順表、単純な順序制約に対応し、別順序への展開は128件までです。未知の構造・Grid/Grouping・複数入力/PRTは一般のSTACK Edit WebAppで確認してください。
- 元XMLのバイトはCSV/作業ZIPに保持します。問題変数の任意コード・未知フィールド・添付・テストは保持し、保持できない構造の削除は理由を示して拒否します。認識した旧形式の採点は設定された正解順序・制約から生成し直すため、保存後に実際の採点を確認してください。
- 問題文・選択肢は問題変数内の `castext` と、MCQ/PRT共通の `%__mcq_lang` で多言語化します。フィードバックの文字列も問題変数に保持し、解答を参照するCASTextはPRTのフィードバック変数で評価します。`prooflib.mac` と必須の `multilang_library.mac` をXML生成時に読み込みます。生成コードは専用マーカー内に置き、利用者の問題変数と分けて管理します。
- `parsons_encode` / `parsons_decode`、Parsons型の解答欄を使用します。入力・採点の互換性は、使用するSTACK版で確認してください。

## English

A localhost authoring app for flat STACK Parsons proofs. Define multilingual CASText question prose, stable step IDs and choice text, a teacher order and either explicit alternative orders or dependency chains. Distractors remain choices but are excluded from accepted proofs. Dependency mode requires exactly the teacher-answer steps, once each, and all specified precedence relationships. The app does not judge mathematical validity independently of the author's specification.

Run `make start` and open localhost:4177, or run `python3 app/parsons-webapp/server.py`. CSV/XML/project saving retains original XML. Overwrite uses browser file handles where available; other browsers download copies. ZIP archives containing several question XML files must be unpacked first. Limited static import supports proof/proof_c/proof_iff; unknown/grouping/grid structures require general STACK editing. No imported CAS/HTML is executed in the editor.

Qbank launches explicit expiring localhost sessions. Save and close, or XML Save, returns the edit and closes only after acceptance; conflicts leave the tab open with local-copy options. Save the bank project ZIP separately. Standalone operation saves files. Models use version 3 / mode parsons and are identified as PRT-PARSON. Shared translation protection/provider settings are reused from MCQ. AI calls are explicit and were not live-tested.

## 仕様・検証 / Specification and verification

[STACK公式Parsonsガイド](https://docs.stack-assessment.org/en/Specialist_tools/Drag_and_drop/Parsons/)、[Proof CAS library](https://docs.stack-assessment.org/en/Topics/Proof/Proof_CAS_library/)に従います。実施した試験と未確認範囲はルートHANDOFF.mdを参照してください。順序の試行、XML生成、実際のMoodleインポート・採点は区別して記録します。

Feedback source text is stored with the question variables/model. Answer-dependent CASText (for example `{@length(saa)@}`) is evaluated after the PRT response variables are initialized.
