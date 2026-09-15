# 開発引き継ぎ

更新日: 2026-09-15

この文書は、別のMac・別の開発者・新しいCodexタスクでも開発を再開するための現在地です。作業開始時に読み、作業終了時に更新してください。継続的な開発ルールは [AGENTS.md](AGENTS.md)、利用方法は [WebApp README](app/mcq-webapp/README.md) を参照してください。

## 現在の対象と状態

- 主な開発対象: `app/mcq-webapp`（CSV/XLSXや編集画面からMoodle STACK用の多肢選択問題XMLを生成）。
- 直近の変更: インポート前の問題プレビューを追加。STACK APIで描画・採点し、編集時点のパラメータとinclude内容を反映。コミット・送信状態は `git log` と `git status` で確認すること。
- 最新版をNextcloud外へ新規cloneして `make setup` を実行し、利用者からセットアップ完了・WebAppの起動成功の報告あり。
- 日本語サンプルCSVを `app/mcq-webapp/samples.ja` 直下へ統合。看護学の重複10件をNUR識別子へ統一し、全6分野60問を収録。

## 直近の変更と決定事項

- 001.GaussElimRowReducedCheck-B-3x4rk2-rb.xmlのAPI HTTP500を調査。include展開後450行目のEOFコメント末尾に単独セミコロンがあり、normalizedQvarsが末尾コメントの前の終端記号を見落として追加していた。コメント除去後のコード末尾で判定するよう修正し、該当XMLの余分なセミコロンも削除。末尾コメント／コメントのみ／文字列内コメント記号／未終端コードの回帰テスト追加、variant_parameters成功。修正XMLをローカルSTACK APIへ送りHTTP200・本文生成を確認。問題文の `%_nc` が `{@%_nc@}` でなく `{%_nc}` になっている別の記述不備もあり、利用者が75e93f7で直接修正・push済み。app.jsキャッシュ更新。commit/push未実施。

- 多言語設定見出しを「多言語設定 ? 展開」に整理し、小さい展開ボタンを移動。?に対象（問題文、言語非依存でない選択肢／FB）と依頼／JSON反映手順を日英で追加。旧「XMLに展開する言語を選択」を削除し、言語ボタン列の先頭へ「展開言語」・ALLを配置。ALLは全11言語を選択して設定保存・表示更新・翻訳再生成必要状態へ更新し、基本言語のロックを保持。問題変数上にdetailsと同色の罫線を追加。VMでALLの選択／保存／更新、HTMLボタン一意性、JS構文・diff検査成功。実ブラウザの配置は未確認。commit/push未実施。

- CASTextチェック右の「（試験運用）」表記を削除し、対応する英訳も削除。ヘルプ・切替動作は維持。JS構文とgit diff --checkを確認。commit/push未実施。

- 問題文の種別をCASTextへ手動変更すると、CASTextテンプレートチェックを自動でオンにし、フィードバックの確認／必要に応じた変換を促す日英通知を表示。test_variant_parameters.cjsで自動オン・入力維持・通知の一回性を検証し成功、JS構文・差分検査成功。実ブラウザ操作は未確認。フィードバックの型表示も再描画。手動入力は保持し、CSV／XMLの設定保存は従来どおり。チェックを明示的に外した場合の出力ガードは維持。README・キャッシュ識別子更新。

- CASTextチェックに日英の移行ヘルプを追加。通常版の問題文種別に独立したcastextを追加し、手動入力を切替時に再変換しない。CSV qtextLのcastext型・XML再編集メタデータで保持。チェック前は編集／CSV保存用とし、XML生成・プレビューはCASTextチェックが必要な旨を案内。型の手動変更で旧自動変換の復元情報を解除。既知のCASフィードバック（sconcat/tex2等）は出力時にCASText化し、独自CAS式は保持。日英ヘルプ・README・キャッシュ識別子更新。
- 検証: test_variant_parameters.cjsに手動CASTextのCSV／メタデータ往復・オン／オフ不変・通常版出力ガード・既知／未知FB変換を追加し成功。test_casttext_migration.cjsも成功。ブラウザ操作は未確認。commit/push未実施。

- CASTextへの一方向変換を実装。外側／入れ子sconcatを分解し、文字列のMaximaエスケープを1段解除、標準tex2・数式内tex1・stack_disp・直接リストtex2Lを文章と埋め込みへ変換。未知の式や動的リストは部分ごとのsconcat文字列化＋選択指示置換を保持。ローカルtex2/tex2Lが標準定義と異なるときは取り除かない（外部include内の再定義は判定対象外）。元式をCSV/XMLに保持し、未編集の旧互換移行も新形式へ更新。一般的な逆変換は実装しない。README・検討メモ更新、app.jsキャッシュ識別子更新。
- 検証: test_casttext_migration.cjs新設（提示例・入れ子・数式内外・動的リスト・独自処理・区切り・エスケープ・標準／独自ローカル定義）、test_variant_parameters.cjs、test_question_text_conversion.cjs、test_pair_swap.cjs、JS構文・git diff --check成功。実装関数が生成した提示例のCASTextをローカルSTACK APIへ送信し本文と負の分数行列の出力を確認。ブラウザ操作・全問題実行は未確認。今回commit/pushは未実施。

- 従来のsconcat/tex2/tex2L問題文を読みやすいCASTextへ変換する規則を調査し、`app/mcq-webapp/CASTEXT_CONVERSION.md` に対象・例外・実装順序案を記録。Git管理対象001/*.txtは60件、既存パーサーで59件279言語分を抽出（SetContainIncludeBはコメント構造により除外）。利用者例の変換候補をローカルSTACK APIで旧式と比較し、数式内の行列埋め込み、負の分数の括弧解消、直接CASTextとの出力一致、LaTeX行列改行の保持を確認。全問題・ブラウザ描画は未検証。この調査ではアプリコードの変更なし、読みやすくする変換は未実装。前回の互換移行等の未コミット変更と利用者の変更を保持。

- 従来版→CASText切替を実装。問題文文字列をcastextリテラル化し、__SELTYPE__/__SELPROMPT__は埋め込み外だけを対応変数へ置換。旧CAS式はssubstで指示を置換する埋め込みへ包み、計算内容を保持してCASText入力に移行。未編集でオフに戻す場合は元式復元（XMLメタデータ／CSV legacy_question_inputsも保持）。CASText中は問題文の型をCASTextへ固定・変換ボタン無効、FBはCASText／CASを維持。選択肢データの?説明と日英ヘルプ追加。「未実装」注記を「試験運用」へ更新。
- 利用者が編集したCAS pre/postのrb2・qtext定義等を保持し.mac再生成、CAS XMLのルート／アプリコピーを同期しnoidea変数の%不足を修正。%__mcq_langcodeをquestionvariables末尾に生成。変数内のlangブロックだけではAPIが言語を認識せず英語へフォールバックしたため、問題文先頭にも選択言語の空langブロックを生成する。
- 実API採点でcastext_concatの3引数呼出がエラーになることを確認し、fvar_casの4箇所を2引数呼出の入れ子へ修正。通常テンプレート本体は今回変更なし。
- 検証: アプリ関数をVMで使い、従来の文字列／sconcat+stack_dispによる負の分数行列をCASText版へ切替、実STACK APIで両者の本文と指示が表示されることを確認。rb2・Checkbox・ptの描画、Radio正解1点／誤答0点とFB、Checkbox正解1点、ja/ptのわからない0点とFBを確認（全採点のerrors/fverrors空）。公開include取得は未検証で、ローカルincludeを展開したプレビュー用XMLを使用。実ブラウザ操作は未検証。
- 回帰: test_variant_parameters.cjs（移行・エスケープ・埋め込み内の置換抑制・保存復元・FB生成追加）、test_question_text_conversion.cjs、test_pair_swap.cjs、test_mcq_pre_castext.py（4件）、JS構文・git diff --check成功。CAS関連に含まれる利用者の先行変更も引き継いだ状態で、commit時はこれらを含める。無関係の001問題ファイルは除外。

- 従来形式からCASText切替の互換性を検証し不具合を確認。アプリのCSV読込／XML生成関数をテスト用VMで実行し、文字列問題文とsconcat＋stack_disp問題文、stack_dispの行列選択肢で通常/CASの4件を実STACK APIへ送信。通常版は正常、CAS版はqtext未定義の変数名を表示。作業中のpost_cas.txtのqtext代入が.mac未反映のため。さらにCAS用.txtを一時的にインライン化した2件では本文と行列は表示されるが__SELTYPE__が残る。langAssocFromFieldsにCASText切替分岐がなく、チェックはテンプレート選択のみ。自動移行は未実装。実ブラウザ操作・採点は未検証。今回アプリ／テンプレート本体は変更せず、作業中のファイルを保持。

- 選択肢設定の行順を、上段「正解が2つ以上の場合も1つ選べばよい」、下段「選択肢に正解はない」／「わからない」の横並びへ変更。HTML順序とgit diff --checkを確認。

- 特殊選択肢を「選択肢に正解はない」を含める／「わからない」を選択肢に含めるへ短縮し横並び。「正解が2つ以上の場合も1つ選べばよい」を使用チェックを追加（日英）。入力形式はrb/cbのまま、XMLの%__mcq_rb_cbはRadio＋オンでrb2、それ以外rb/cb。Checkbox時は無効化しRadioへ戻したときに設定復元。CSV config,radio_multiple_promptとXMLメタデータで保持、旧XMLのrb2も読込、クリアでオフ。
- 通常版postの選択指示も正解数判定からrb2判定へ変更し.mac生成。これにより既存のrb指定問題も新postを使用すると正解数に応じた追加説明は自動付加されなくなる。CASText版は利用者がpre_casへ実装済みのrb2判定を使用。今回、編集中のCAS版雛形／ライブラリは変更していない。問題文のCASText生成・langcode生成は引き続き未実装。
- 検証: node scripts/tests/test_variant_parameters.cjs成功（両テンプレートのrb/rb2/cb、抽選候補に依存しない出力、CSV/メタデータ、モード切替、クリアを追加）。JS構文・git diff --check成功。実ブラウザ・実API確認は未実施。

- 入替ボタンを「正不\n入替」、全体を「全体正不入替」へ短縮（英語Swap\nC/I／Swap all C/I）。一対必須表示は各パターンの正解先頭行のみ削除ボタンを表示し、同パターン全体を削除して不正解だけが残らないようにする。独立モードの削除動作は維持。選択肢／FBを「言語非依存」（Lang.-indep.）へ短縮。FB上部を言語非依存→正解・不正解別（Separate C/I）→型selectの1行へ統合。test_pair_swap.cjsに削除動作検査追加、同テストとtest_variant_parameters.cjs・JS構文・差分検査成功。実ブラウザ配置確認は未実施。

- 利用者指定の暫定注記「（現在、実装されていません）」をタイトル横のCASTextチェックに追加（日英対応）。注記のみの変更で切替動作は維持。JS構文とgit diff --check成功。

- 問題変数見出しをh2＋入力ラベルに変更し「（ランダム変数）」を削除。他の設定見出しと同じフォント16pxを使用。評価ボタンを「評価」（英語Evaluate）へ短縮し、挿入・変換と同じ高さ32pxの共通スタイルを適用。ヘルプのボタン名も更新。HTML要素・共通スタイル、JS構文とgit diff --checkを確認。実ブラウザ確認は未実施。

- include保存ボタン横にファイル名入力欄を追加。既定はbaseTitle（末尾-rb/-cb等を除去）+.txt、手動指定はタイトル変更後も維持。拡張子なしは.txt補完、名前はCSV config,include_filenameとXMLメタデータに保存しクリアでリセット。生成includeの参照URL・pathとダウンロード名を一致させ、読込済みincludeの名前変更時は元のURLディレクトリを保持。検証: test_variant_parameters.cjsに既定名／手動名・rb/cb除去・メタデータ／CSV・URL一致・クリアの回帰検査を追加し成功。JS構文・git diff --check成功。実ブラウザの保存操作は未確認。

- 基本言語のチェックをcheckedかつdisabledへ固定し、基本言語変更時に旧言語は操作可能へ戻す。スペイン語esを編集・翻訳JSON・CSV/XML・プレビュー言語へ追加。通常/CAS両系列のpre/post/fvar定型文とrb/cb全雛形のPRT結果文をスペイン語に対応し.mac生成。利用者のpre_cas内の言語一覧追加は保持してesを追加。CAS版fvarは既に独自実装になっているため、通常版との完全コピー一致という古いテスト条件を撤去。検証: test_variant_parameters.cjs（esのCSV/XML往復・基本言語固定追加）、test_mcq_pre_castext.py（4件）、test_stack_preview.py（7件）、test_preview_ui.cjs成功。全8雛形のPRT3結果文にesがあることとJS構文・差分検査を確認。今回の実ブラウザ／実APIのes描画は未実施。

- CASText切替チェックを選択肢設定からアプリタイトルXML Generatorの右へ移動し「castext 版を使用する」と表示（日英対応）。既存IDと切替・保存処理を維持。通常は横並び、狭い画面では折返し。ルートとアプリ内のCAS版rb/cb全4雛形のpre/post/fvar参照が_cas.macであることを検査。HTMLのチェック一意性・タイトル内配置、test_mcq_pre_castext.py（4件）、variant_parameters回帰検査、JS構文・差分検査成功。実ブラウザ確認は未実施。

- include保存ボタンを左欄の問題変数の下に常時表示。別ファイル保存オフでは非表示にせず無効化し、オンで有効化する。日英のtitleで有効化方法を案内。保存処理は変更なし。JS構文検査・variant_parameters回帰検査と表示状態の確認、git diff --check成功。実ブラウザ確認は未実施。

- CASText対応を別テンプレート系列へ分離。mcq_template_{pre,post,fvar}_cas.txt/.mac、001.MCQ_cas-{rb,cb}.xmlとアプリ内コピーを追加。通常preは10言語の文字列配列のみ、pre_casは同名変数にcastextリテラル配列を定義。変数名の_cas別名は撤去。post/fvarのCAS版は現段階では通常版の完全コピー。通常XMLは変更なし。
- アプリの選択肢設定にCASText版（試験運用）のチェック（日英）を追加。既定オフ、XML生成／プレビューのテンプレート3参照をまとめて切替。CSV config,castext_templateとXMLメタデータへ保存、旧XMLはpre_cas参照で判定、旧CSV・旧メタデータ・クリアはオフ。問題文等の全面CASText化は今後の作業。通常のローカル問題変数評価は既存preを使用するまま。
- makeにCAS版3ファイルを登録し.mac生成。配列内容・10言語順・生成物・XMLコピー／参照の検査、JSのテンプレート選択とCSV／メタデータ往復・クリアの回帰検査を追加。実STACK APIでCAS版Radio／Checkboxの2選択肢＋特殊選択肢2つの描画を確認。公開先include取得と実ブラウザの配置確認は未実施。 検証コマンド: python3 -m unittest discover -s scripts/tests -p test_mcq_pre_castext.py（4件成功）、node scripts/tests/test_variant_parameters.cjs、node scripts/tests/test_question_text_conversion.cjs、node scripts/tests/test_pair_swap.cjs（すべて成功）、JS構文検査、git diff --check。

- 評価状態（未評価／評価中／結果）を問題変数欄の下から評価ボタン右へ移動。同じflex行にまとめ、aria-liveと既存更新処理を保持。空になった下部コンテナを撤去。HTMLで状態表示の一意性・配置、差分検査を確認。実ブラウザ確認は未実施。

- 問題文の挿入・変換・型selectを高さ32px、同じ文字サイズ／余白へ統一し、見出し内の間隔を10pxへ調整。基本言語ラベルと64pxのselectを多言語設定見出しの右端へ移動。各言語チェック項目は62pxから48pxへ縮小し、余白・間隔も縮小。
- 表示のみの変更。HTMLのID重複・要素配置と差分検査を確認。実ブラウザ確認は未実施。

- make setupのcompose pullに--policy missing、共通start_servicesのupに--pull missingを指定。取得済みタグを再利用し、不足イメージのみ取得。タグ内の更新は自動確認しないためREADMEに明示pullの手順を追加。Docker公式のpull/upポリシーに従う。
- 選択肢・フィードバックの言語非依存チェックと型selectを同じcontrols行へ統合（固定／一対の両モード）。CAS長さも同じ行、型selectの左に保持。
- 検証: test_docker_startupへsetupからpullとupまでのmissing指定を検証するモックテストを追加。pair_swap・JS構文・差分検査成功。実イメージ取得・ブラウザ配置確認は未実施。

- 問題変数の見出しを「問題変数（ランダム変数） ? 問題変数を評価 ［コピー］」へ変更。?に用途、選択肢設定→パラメータ→問題変数の順序と役割、再評価を説明。評価状態は入力欄下に維持。
- 別ファイル保存チェック・include URLベースを左欄最下部へ移動。include保存ボタンも同じ設定群へ配置。チェック横の?へ公開URL、共通includeとパラメータの使い分け、XMLとincludeの個別保存・公開先へ配置が必要であることを記載。常設の公開URL説明と旧titleは撤去。日英対応・キャッシュ更新。
- 検証: HTMLパーサでID重複なし、評価ボタン／入力欄／include設定の順序を確認。question_text_conversion／variant_parameters、JS構文・差分検査成功。実ブラウザの配置確認は未実施。

- 問題文のCAS説明を「qtext: sconcat(...);という代入文ではなく、右辺の式だけを入力」と明確化。挿入の説明を?へ統合し、挿入メニューのツールチップを撤去。
- 問題文・?・地球＋言語・挿入・変換・型selectを1行へ統合。言語別ラベル／型selectを共通見出しへ移し、基本言語切替に追随させる。CAS欄の色更新はtextareaの親を参照するよう変更。?は18pxの正円、縦横最小／最大寸法と行高を固定。挿入機能は維持。
- 検証: question_text_conversion／variant_parametersテスト、JS構文／差分検査成功。今回の実ブラウザ配置確認は未実施。

- 問題文見出しを「問題文 ? [挿入] [CAS変換]」へ整理。「?」には文字列の文章＋{@…@}対応、ブロック非対応、CAS式は問題文変数へ代入する文字列を返す式（左辺不要）の説明を追加。SELTYPE／SELPROMPT説明は挿入メニューのホバー／フォーカスへ移動。説明は閉じたdetailsの外に配置し、メニュー展開中は重ならないよう非表示。
- 挿入メニューは既存file-menuの閉じる処理を利用。textareaのselectionStart/Endで現在言語へ挿入／選択置換、カーソルを挿入末尾へ戻しinputイベントで生成・翻訳状態を更新。型は変えない。日英文言とJS/CSSキャッシュを更新。
- 検証: question_text_conversionでカーソル挿入・選択置換・Unicode・inputイベント・CAS文字列内・他言語保持のテスト追加、成功。JS構文／差分検査成功。今回の実ブラウザ配置・ポップアップ操作は未確認。

- 文字列問題文の{@…@}をlangAssocFromFieldsで内部自動変換。XML／include生成・プレビューの共通経路に適用し、入力欄・型・CSV・XMLメタデータは元の文字列を保持。明示ボタンも残し説明を更新。問題文以外の選択肢・フィードバックの変換は追加していない。
- 検証: question_text_conversionで自動／明示生成コードの一致、元入力・型保持、通常文章／CAS式の既存動作、異常時の未変更を確認。variant_parameters／translation_cas、JS構文・差分検査成功。先の実API確認で検証した同じ変換関数を使用。今回のブラウザ確認は未実施。

- 問題文に「CAS式変換」ボタン＋ホバー／フォーカス説明を追加（日英）。現在の基本言語の文字列のみ、{@式@}をstack_dispとsconcatの式へ変換しCAS型に切替。通常はi、既存の\(…\)／\[…\]内は空文字の表示モードを使い二重数式環境を防ぐ。文章は既存maximaStringでエスケープ（改行はbr）。他言語、LaTeX、選択指示プレースホルダーを保持。
- 引用符／コメント内の@}は区切りとみなさない。閉じ忘れ・空埋込・CASTextブロックは未変更でエラー通知。CAS型の再変換は拒否。変換後は翻訳を更新必要とする。
- 検証: test_question_text_conversion.cjsで例文、既存数式環境、複数式、引用符／コメント、異常入力、型変更・二重変換・他言語不変を確認。variant_parameters／translation_cas、JS構文・差分検査成功。実STACK APIにa=-1/4を与え、元のCASTextと生成式で文章・負の分数・プレースホルダーの一致、数式環境内の二重ラップなしを確認。ブラウザのボタン・説明表示は未確認。

- ルートとapp/mcq-webapp/templatesの001.MCQ-rb.xml／001.MCQ-cb.xml（計4ファイル）のfeedbackvariables参照をmcq_template_fvar.txtから.macへ変更。prtcorrect／prtpartiallycorrect／prtincorrectは既存ja/enを保持しfr/it/de/pt/zh/ko/ru/svを追加、全10言語のmultilang spanに統一。読み込みURLとapp.jsのキャッシュ番号を更新。
- 検証: Python XML解析で4雛形の構文、各メッセージ10言語・重複なし、ルート／アプリコピーの完全一致、.mac参照先の存在を確認。variant_parametersの既存XML生成／CSV往復テスト、JS構文・差分検査成功。実STACK APIの各言語採点表示は未確認。

- CSV・XML・include保存の通知を「ファイル名 のダウンロードを開始しました。保存状況はブラウザで確認してください」へ変更。ブラウザへ保存要求を渡した時点で完了と断定しない。実際の保存処理は変更なし。日英対応・JSキャッシュ更新。JS構文／差分検査成功、ブラウザ実機確認は未実施。

- 負の分数の行列表示を実STACK API（stackmaxima 2026062900／stackapi 2026062900-2）で比較。matrix([-1/4,-2/3],[1/4,2/3])についてtex1のみ負の分数に余分なleft/right括弧が付き、直接CASText・stack_disp(m,"i")・stack_disp(unary_minus_sort(m),"i")・castext("{@m@}")では付かない。複数行列＋文字列を1つの数式環境に連結する場合も、tex1をstack_disp(m,"")に替えてAPIで成功。
- APIの比較入力／生の結果をscripts/tests/fixtures/negative_fraction_display_{request,result}.jsonへ保存。既存001/GaussElimInverseElemMatProd-A.txtは未変更。文字列選択肢にはstack_dispを提案（castextオブジェクトは単純なsconcat文字列置換用ではない）。公式資料はSTACK DocsのAuthoring/Inputs/Multiple_choice_inputおよびAuthoring/CASText。

- プレビュー言語選択を地球SVG＋右横のselectへ変更し、inline-flexで一体の横並びにした。日英のaria-labelとホバー説明を保持。JS/CSSキャッシュ更新。JS構文・差分検査成功。配置のみの変更でブラウザ確認は未実施。

- プレビュー「解説を表示」の右へ言語selectを追加。activeLangsの言語名＋コードを表示、基本言語から開始。変更時はsnapshot.langを更新して同じseedで再生成、以前の回答／結果を破棄。処理中は言語selectを無効化。保存用XMLや編集基本言語は変更しない。既存server.pyがrender／gradeへ渡すlangを使用し、問題変数へ手書き代入は挿入しない。
- 検証: `node scripts/tests/test_preview_ui.cjs` でen／ptが表示・採点の両要求へ入りseed保持されることを追加、既存の入力・フィードバック・プロキシ経路検証も成功。JS構文・差分検査成功。実STACK APIでの言語別表示およびブラウザ操作は未確認。

- 選択肢パターン番号を60pxのselectへ変更。正解1〜5、不正解1〜9、一対モードは共通1〜5。内部CSV/XMLのゼロ埋め番号は維持。追加は各側の空き番号を再利用し上限で停止。範囲外の既存番号は保持してXML生成時に修正案内。
- 選択肢のCAS評価バッジを型selectと同じ行の左へ配置。リスト成功時はlength:件数のみ（複数式は合計）、評価値の詳細はtitleに保持。評価中／失敗／未評価の案内も同じ行。パターン列幅も縮小。
- 検証: variant_parametersでselect範囲、追加上限、空き番号再利用、範囲外XML生成拒否、length表示を追加して成功。既存CSV/XML往復・pair_swapテスト、JS構文・差分検査成功。今回の実ブラウザの配置確認は未実施。

- パラメータがコメントのみでも終端セミコロンを追加する問題を修正。空欄・コメントのみは追加せず、未終端の式だけ末尾へ補う。cleanParameterStatementsで独立した空のトップレベル文（`;`／`$`）を除去し、CSV・XMLメタデータ・旧include読込、保存・評価コード生成へ適用。コメント、文字列内の記号、実際の文を終端する別行の`;`は保持する。
- 検証: `node scripts/tests/test_variant_parameters.cjs` で空欄／空文／コメントのみ／ネストコメント／終端済み・未終端の代入／文字列内の記号／別行の必要な終端を確認。既存XML・CSV往復も成功。JS構文・差分検査成功。今回のブラウザ・実Maxima確認は未実施。

- 「クリア後も %_rk:2; だけ残る」の原因はparameters textareaのplaceholderだった。値は空でも同じコード例が表示されていたため、placeholderを削除。例は「？」の説明内だけに残す。以前の実ブラウザ検証はvalueの空文字だけを確認し、placeholder表示を見落としていた。HTMLにplaceholderがないことを回帰テストへ追加し、variant_parameters／差分検査成功。

- 全入力クリアの途中でsetModeがXML生成を呼び、空の選択肢のエラー通知を出していた。初期化時は生成を抑制。空データのupdateOutputもエラーにせず入力案内とし、完了通知を表示。「命題パターンがありません」を「選択肢がありません。選択肢を追加してください」へ変更。
- 検証: variant_parametersの回帰テストへ途中生成禁止と実updateOutputによる空状態の確認を追加、成功。JS構文／差分検査成功。実ブラウザで初期画面に `%_rk:2;` を入力後、全入力クリアを押し、parameters・questionJaが空、statusLine・通知が「すべての問題入力をクリアしました」となることをDOMで確認。以前のテストはupdateOutputを代替していたため途中のエラー通知を検出できなかった。

- 同名の「クリア」が2つ残っていたため、選択肢のみを消す旧ボタンを撤去。表示設定左の「全入力クリア」に一本化（日英対応・キャッシュ更新）。パラメータを含む全入力消去の既存テストとJS構文／差分検査成功。利用者がどちらのボタンを押したかは未確認。

- CSV／XML読込時の評価結果・ログ・送信コード・翻訳依頼のクリアを共通化。評価リクエストの世代番号で、読込／クリア後に完了した古い応答を無視する。XMLのinclude読込後の新規自動評価は維持。
- CSVで省略した設定は前の問題から継承せず初期化し、パラメータ未指定は空欄。明示したparameters／require_pairs等は復元。正解・不正解一対は初期表示・クリア・CSV未指定時にfalse。古いXMLメタデータの既存互換性は維持。
- 表示設定の左に全問題入力の「クリア」を追加（確認でキャンセル可）。表示幅・UI言語・接続先は保持。「読込」に短縮しメニュー幅を縮小。UI言語selectの横へ地球SVGアイコンを追加。日英文言／キャッシュ更新。
- 検証: `node scripts/tests/test_variant_parameters.cjs` でCSV／XMLの残留状態消去、明示設定の保持、クリア／キャンセル、遅延評価応答の無視を追加。既存のfile_ui／pair_swapテスト、JS構文／差分検査成功。実ブラウザの初期画面でクリアの位置・一対オフ・読込メニュー構成を確認。クリック操作は自動化ツールのタイムアウトで完了確認できず、クリアの実操作と実Maximaによる評価は未確認。

- ファイル操作をCSV／XMLの「見本・読み込み・表示・保存」へ統合。縦XMLタブとXML表示設定を撤去し、表示は読取専用ダイアログ＋コピー。include保存は問題変数見出しへ移動。表示言語は日本語／Englishのselectへ変更。
- 問題変数コピーは欄内の原文をそのままコピーし、生成処理のエラーから独立。Clipboard API→execCommand→手動コピー用の選択済みダイアログでフォールバック。成功／失敗の通知を追加。コピー済みと断定するのはAPI成功時またはexecCommand=trueのみ。
- `file-ui.js` を追加。幅はlocalStorageへ保存、読込フォルダはshowOpenFilePickerのCSV／XML別idでブラウザに記憶させる。非対応環境は標準file inputへ戻す（フォルダ記憶はブラウザ／OS依存）。
- 見本API `/api/repository/samples` はCSV（samples.jaとsample.csv）とXML（001／samplesのMCQ）を一覧・読込。公開見本ディレクトリのファイルだけ許可し、任意パス・シンボリックリンクを除外。静的公開向けにsamples-index.jsonを同梱（見本追加時は更新）。API呼出は既存webappUrlでサブパスを維持。
- 検証: `node scripts/tests/test_file_ui.cjs` でコピー内容の完全一致、API拒否時の代替コピー、手動選択、空欄、幅復元を検証。Python23件（見本一覧／読込制限を含む）、既存のパラメータ／CSV・XML往復、プレビュー、翻訳、入れ替えNodeテスト、JS構文／差分検査成功。
- 実ブラウザ: 問題変数・CSV・XMLのコピー成功通知、CSV／XML表示、CSV61件・XML56件の見本一覧、NUR01読込、001のrank2 XML読込、日英切替、幅648／660を新しいタブで復元、旧XMLボタン／設定の不存在を確認。rank2の自動CAS評価は既知のDocker参照エラーで失敗し、今回のUI変更ではDocker設定を変更していない。実際のOSフォルダ再選択と静的公開版の見本取得は未確認。

- 選択肢数・正解選択肢数を各60px幅へ縮小し、ラベル／数値入力／ランダム正解数チェック／候補入力を同じ横並びの行へまとめた。候補欄の表示条件は維持。狭い領域では折り返す。CSSキャッシュ更新、差分検査成功。表示のみの変更、ブラウザ確認は未実施。

- 形式と採点方式を同じ行へ移動し、採点方式ラベルとドロップダウンも横並びにした。Checkboxのみ表示／有効化し、Radioの生成コードはscmethod=1へ固定。Checkboxの選択値は保持。狭い領域では折り返す。JS/CSSキャッシュを更新。`node scripts/tests/test_variant_parameters.cjs` で表示／無効化、Radio固定、Checkboxの復元を検証。JS構文・差分検査成功。今回のブラウザ検証は未実施。

- 採点方式欄のホバー／選択欄へのキーボードフォーカスで4方式の簡単な説明、負のscが最終得点0になること、noideaの0点を表示するツールチップを追加。既存の説明CSSを再利用し日英対応。翻訳JS構文と差分検査成功。ブラウザ実機確認は未実施。

- 特殊選択肢チェック2つを左、採点方式を右の160px幅にまとめた。狭い領域では折り返す。CSSキャッシュを更新。表示のみの変更。差分検査成功、ブラウザ実機確認は未実施。

- 特殊選択肢「選択肢に正解はない」「わからない」のチェックを形式直下へ追加（既定false）。採点方式1 Jaccard／2 MTF／3 φ係数／4 CFGの選択を追加（既定1）。XML・CSV・旧XMLフラグ読込に対応。設定はpre読込後、主問題変数／include前へ出力。「正解なし」の真偽は設定した正解数が0かで決定する。旧XMLの任意パラメータは維持。
- ATCM 2022論文 §2.4の式に従い、preに `%__mcq_scmethod:1;`、fvarのscへ分岐を追加。φ係数の分母0は0、「わからない」は0、通常の正解0件は完全正答のみ1。既存の特殊選択肢による0点制約／PRT分岐は維持。生成XMLでは特殊選択肢の文言を%_STACK_LANGで選び直し、noideaフィードバックの欠落した%も補う。
- `make mcq_template_pre.mac mcq_template_fvar.mac` で生成。fvar.macは元の末尾改行なしを維持するため生成後に末尾だけ整えた。旧macとの差分がscmethod既定値1行とsc計算ブロックだけであることを、差分の逆置換による元ファイルとの完全一致で検証。
- 検証: `python3 scripts/tests/check_mcq_scoring.py` で実Maximaによる全fvarの740ケース成功（4方式、負点、分母0、部分点無効、noidea、正解0）。`node scripts/tests/test_variant_parameters.cjs` で新設定のXML/CSV往復・旧設定既定値・旧includeフラグ復元を確認。既存の候補数・XML読込・翻訳・入れ替えNodeテスト、Python20件、JS構文、差分チェック成功。
- 実ブラウザ／STACK API: 日英UI、特殊選択肢の日本語表示、CFG誤答のsc=-1、noideaの0%と説明、φ方式で正解0件の「正解なし」100%を確認。重要な制約: このSTACK APIはsc=-1でも最終得点0%を返した。負の計算値は保持・表示されるが、Moodle成績へ負点を記録する機能は今回のテンプレート変更だけでは実現しない。READMEにも明記。STACK/Moodle本体は変更していない。

- 選択肢側の「選択肢は言語に依存しない」も「言語に依存しない」へ短縮。既存の共通翻訳を利用し、JSキャッシュ番号を更新。動作変更なし。JS構文・差分検査成功。

- フィードバックのチェックを「正解・不正解別」「言語に依存しない」へ短縮し、titleに用途説明を追加。日英対応。
- 入れ替えはC/W表示の反転から内容の交換へ変更。等しい候補行数ではC/Wの位置を保持し、全言語・型・フィードバックを交換。非対称の行数では各側の候補群を交換し、件数に合わせて表示。評価キャッシュは従来どおり破棄。
- 検証: `node scripts/tests/test_pair_swap.cjs` で個別・全体、非対称群の内容保持、等しい行数での位置維持、2回操作の復元を確認。JS構文と差分検査成功。今回のブラウザ検証は未実施。

- 正解・不正解列のフォントを12pxへ縮小。列の最小幅104px、選択欄の最小幅88pxと矢印用余白を確保し、ラベルが狭い欄で切れないよう調整。CSSキャッシュ番号を更新。`git diff --check` 成功。ブラウザ実機確認は未実施。

- 入れ替えボタンを「正↔不」「全体：正↔不」へ短縮。titleとaria-labelに操作説明を設定し、日英翻訳・README・キャッシュ番号を更新。処理は変更なし。JS構文検査と差分チェック成功、今回のブラウザ確認は未実施。

- 評価ログの前に原因推定を追加。EOF構文エラーで送信コード末尾の終了記号不足、引用符／括弧／コメントの閉じ忘れを保守的に検出し、評価コードの行と抜粋を表示。入力の自動修正はしない。include先など原因不明時は一般的な確認案内のみ。変数評価成功後のCAS式エラーに問題変数の行を誤って割り当てない。
- QVARS区間から内部マーカーを除いた出力を通常表示し、完全なログは折り畳み「Maximaの生ログ」に保持。日英UIとキャッシュ番号を更新。
- 検証: `node scripts/tests/test_pair_swap.cjs` で提示された形式のEOFログ、終了記号不足、閉じ忘れ、文字列／ネストしたコメント内の括弧無視、includeの位置非断定、ログの詳細保持を確認。JS構文検査と `git diff --check` 成功。今回の推定表示はブラウザおよび実Maximaでは未検証。

- 正解・不正解一対モードにパターン別／全体の入れ替えボタンを追加。各候補行のC/Wを反転し、全言語の選択肢・フィードバック・型・CASリスト属性を保持する。共通フィードバックは維持、2回で復元。候補数が非対称でも損失なし。評価中は入れ替えを止め、入れ替え後はCAS評価キャッシュをクリアする。
- 評価失敗時はMaximaログを自動展開し、送信コードのスナップショットを行番号付きで表示。サーバーは問題変数失敗だけでなく個別CAS式の失敗でもログを返す。後続出力に押し出されて最初のエラーが消えないよう、問題変数開始位置から最大32,000文字を保持。行番号を出さないMaximaエラーの自動位置特定は未対応。
- 検証: `node scripts/tests/test_pair_swap.cjs`、候補数・パラメータ・翻訳の既存Nodeテスト、`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v`（20件）、JS構文検査、`git diff --check` 成功。ブラウザで個別／全体操作、日英ボタン、評価失敗ログ・送信コードを確認。実環境のDockerでは評価ファイルがコンテナから見つからず、式内のゼロ除算まで実行できなかった。式失敗ログは模擬テストで確認。既存Dockerサービスの設定は変更していない。

- 編集画面の「真・偽」を「正解・不正解」へ変更。選択欄、見出し、ペア設定、フィードバック説明、関連READMEを統一し、英語もCorrect/Incorrectに変更。C/Wの保存値と旧CSVの真・偽入力の認識は維持。JSのキャッシュ番号を更新。
- 検証: `node --check app/mcq-webapp/app.js`、`node --check app/mcq-webapp/i18n.js`、`git diff --check` 成功。表示文言のみの変更で、ブラウザ実機確認は未実施。

- 翻訳返答のCAS式で内側の引用符が未エスケープになり、JSON解析に失敗する報告あり。翻訳依頼へJSONの引用符・バックスラッシュ・改行のエスケープ、コードブロックでの返答、プレースホルダーのアンダースコア保持を明示。JSON.stringifyで生成した有効なCAS式のJSON例を追加。
- 検証: `node scripts/tests/test_translation_cas.cjs` で依頼文内のCAS式JSON例をJSON.parseし、元の式と一致することを確認。既存のCAS翻訳／型保持テスト・JS構文・差分検査も成功。外部ChatGPTが必ず有効なJSONを返すことを保証する変更ではなく、不正なJSONを自動修復する処理は追加していない。

- 多言語展開のCAS対応を修正。CAS式内に日本語文章があっても依頼JSONではnullにしていたうえ、依頼作成時に既存の他言語CAS式を基本言語で上書きしていた。言語依存のCAS式を全文翻訳対象とし、式内の文章だけを訳す指示を追加。言語非依存の項目だけを複製する。返答反映では基本言語の型とCASリスト属性を保持。
- 翻訳元question_text／rowsとtranslations内の訳文の区別を依頼文・READMEへ明記。返答形式の例は固定enから実際の展開先言語キーへ変更。
- 検証: `node scripts/tests/test_translation_cas.cjs` でptのCAS問題文・CASリスト・CASフィードバック、既存en非上書き、n/a除外、通常文字列JSON互換を確認。既存のパラメータ・候補数・XML読込テスト、JS構文と差分検査も成功。ChatGPTが生成した実返答とブラウザでの往復は未確認。利用者の「全て日本語」が依頼JSON・返答・反映後のどの段階かは確認待ち。

- パラメータ見出し右端へ「？」を追加。問題文と同じホバー／フォーカス用ツールチップを再利用。共通stack_includeでの用途、rank指定例、実行順、未設定時のみ既定値を入れること、個別XMLへの保存を日英で説明。常設の実行順メモはツールチップへ移動。
- 説明追加の検証: 実ブラウザで初期非表示→ボタンのフォーカスによる表示、日本語4段落と英語切替を確認。翻訳JS構文と差分検査成功。処理ロジックは変更していない。

- 左右の初期幅を固定390pxから4:6へ変更。ウィンドウの幅に追従し、ドラッグ／スライダーで手動調整した後はその幅を優先する。狭い画面の縦並びは維持。JS/CSSのキャッシュ番号を更新。
- 幅変更の検証: 実ブラウザで左492px・右738px（4:6）、境界線ドラッグ後に615px・615px（5:5）を確認。JS構文・差分チェック成功。表示のみの変更で、問題生成・採点処理は変更していない。

- プレビューのサブパス修正: 新機能だけ `fetch("/api/stack/...")` でサイト直下へ送っていたため、Moodle配下の公開構成でHTMLの404等をJSONとして解析していた。既存の `webappUrl()` を使用し、描画・採点とも公開パスを保持するよう修正。HTML応答はHTTP状態と再起動／ログイン確認の案内を表示する。プレビューJSのキャッシュ番号も更新。
- この修正の検証: `node scripts/tests/test_preview_ui.cjs` でサイト直下・`/mcq-webapp/`・`/moodle/mcq-webapp/` の描画／採点URL、HTML 404・ログインへの転送・既存JSONエラーを模擬応答で確認。JS構文と差分検査成功。利用者の実サーバーでの再確認は未実施。

- プレビュー追加: 上部ボタンから独立したダイアログを開く。`preview.js` は明示操作時だけAPI／数式表示を利用し、編集・保存のイベントを置き換えない。Radio/Checkbox回答、得点、PRTフィードバック、全般的解説、乱数の種の切替に対応。日英UI対応。
- `previewQuestionSnapshot()` は保存用XML生成後のコピーに、パラメータ→編集中のinclude本体を組み込む。プレビュー専用サーバー処理はローカルの共通includeを展開し、指定seedのdeployedseedを補う。描画後の展開済みXMLをクライアントへ返し、採点・別seedの表示にも同じコピーを使う。CSV・保存XML・共有ファイルには影響しない。
- `/api/stack/preview` と `/api/stack/grade` を追加。接続先制限は既存APIと共通。includeのリポジトリ外参照／非公開ファイル／循環を拒否。描画・採点用JSONのみ最大4 MiB（展開済みXML往復用）、既存APIは512 KiBを維持。画像はサーバー経由でdata URLにして返す。
- 問題HTMLはスクリプト無効のsandbox iframeへ表示。MathJax 3.2.2のSVG版とApache 2.0ライセンスを同梱し、外部CDNは不要。JSXGraph等の対話型iframeは未対応として明示エラー。Moodleテーマとの見た目の完全一致は対象外。
- プレビュー検証: Python単体17件、Nodeの既存XML・候補数・パラメータ／保存XML非変更・プレビュー回答／プレースホルダーの回帰テストを実施。実APIで天体Radioとrank 0/1/2のCheckboxをseed 1/2で描画し、8通りすべて模範解答100%を確認。展開済みコピーでの採点も確認。
- 実ブラウザ: 日英UI、Radio正答100%／誤答0%と解説、既存rank 2 XMLのCAS評価→行列の数式表示→Checkbox満点、パラメータだけrank 1へ変更→再評価→問題文／選択肢の反映、seed入力直後の採点無効化、回答変更時の得点／解説消去、API接続先エラー後も生成XMLと保存操作が利用可能なことを確認。静的プロット画像、対話型図、Ubuntu実機での確認は未実施。

- ルートREADMEを日英とも一般利用者向けに再構成。AI翻訳プロンプトと個別変数名への注意、未確定の公開・一括変換予定を削除。導入・サンプル・問題作成・多言語対応・管理者向けガイド・開発参加への導線を整理し、翻訳時のコード保持ルールはAGENTS.mdへ移動。
- README整理の検証: 日英の内容対応、相対リンクの参照先、Markdownコードブロックの対応、差分チェックを確認。文書のみの変更のためアプリのテストは再実行していない。

- パラメータ欄: 問題文の上へ追加。既存XMLのメイン `stack_include` 前の任意の設定・コメントを復元する。XML側の選択肢数・正解数をinclude先の既定値より優先して画面に設定し、それ以外をパラメータへ分離。対応できない選択肢設定式は黙って破棄せずエラーにする。
- 実行・出力順は「画面の選択肢設定 → パラメータ → 問題変数本体／stack_include」。共有include出力に個別パラメータを埋め込まない。既存includeの既定値もvariant設定で上書きしない。
- XMLメタデータの `parameters` とCSVの `config,parameters` で再編集可能。旧データは空欄扱い。ローカル評価とCAS検証用コピーにも先行設定を適用する。
- 正解数候補の重複は抽選の重みとして保持する（`rand([2, 3, 4, 4])` を重複排除しない）。

- 初期文言: タイトル例は `MCQ_sampleXYZ`。初期問題・同梱CSV・天体XMLは「次の恒星・惑星・衛星に関する主張について正しいものを __SELTYPE__。」を使用し、英語も語順を合わせる。固定真偽モードのCSV見本は方程式の解に関する文言を使用。「？」とREADMEに `__SELTYPE__`（選択動作）と `__SELPROMPT__`（指示文全体）の違い、誤り・rankを条件にする例を記載。既存60問などが使う `__SELPROMPT__` の置換仕様は維持。
- 文言変更の検証: JS構文検査・既存XML読込の回帰テスト・差分チェックが成功。ブラウザでの確認は今回未実施。

- 候補数の修正: `updateOptionLimit` が未評価の各CASリストを1件と数え、読込済みの選択肢数を2などへ自動変更していた。未評価／再評価待ち／評価失敗のリストがある間は入力上限を未確定とし、評価後は実際の合計を上限に設定。入力値は自動変更せず、候補不足は生成時に検証する。
- XML読込時は前の問題のCAS評価結果をクリアし、行番号が同じ別問題の評価結果を候補数へ流用しない。

- Ubuntuで更新後もCASリスト表示にならないとの報告。XML名・画面URL・コミット番号は未確認で、利用者環境の原因は未確定。前回のJS/CSS/翻訳更新でキャッシュ用URLの番号が据え置きだったため更新し、ローカルサーバーのHTML/JS/CSS応答へ `Cache-Control: no-cache, must-revalidate` を追加。
- 実ブラウザで `001/001.GaussElimElemMatOp-A-rb.xml` をファイル選択から読み込み、ローカルinclude経由で `ListAL1`・`ListBL1`・`ListBL2` がすべて「CASリスト式」と表示されることを確認。検証環境のMaxima評価は失敗しており、評価成功までは確認していない。

- 既存XML読込: 再編集用メタデータのないXMLの `%__CoptL1`／`%__Copt1L` などと対応するW候補は、代入された候補リスト全体を1行の `cas_list` として復元。リスト要素を個別の `cas` に分解せず、`map(...)` 内の角括弧や添字を代入式本体と誤認しない。多言語の各候補リスト・フィードバック、および旧ランダム化XMLのパターン分割を維持する。メタデータ付きXMLは従来どおり保存済みの型を優先。

- サンプル統合: 旧 `samples/SampleNurse001.csv`〜`SampleNurse010.csv` はNUR各問と問題ID以外が同一であることを確認し、重複を解消。旧 `samples/applied-ja` のCSV・README・スクリプトを `samples.ja` へ移動。XMLサンプルは `samples` に残す。
- 看護学10問は `samples.ja/NUR*.csv` を正本として直接編集する。生成スクリプトは他5分野50問を再生成し、看護学を上書きしない。

- `65c266b`: 問題編集画面のレイアウト改善、表示言語・基本言語・展開先言語の保存。
- `d94cc56`: 問題文を「選択肢設定」の下、「選択肢データ」の上へ移動。
- 問題文見出し右端の「？」に、ホバーまたはキーボードフォーカスで説明を表示。常設の説明で画面の場所を取らない方針。
- 説明には `__SELPROMPT__` の自動挿入、Radio形式で複数正解があり得る場合の指示文全文、プレースホルダーを使わず自分で指示文を書けることを含める。日本語・英語のUIに対応。
- macOSではsetup/start/restart/Finderランチャーからの起動時、Dockerへ接続できなければインストール済みDocker Desktopを起動して最大120秒待機する。接続済みなら再起動しない。`make check` はDockerの自動起動を行わない。
- CSV schema v2、旧CSVの読込、パターンごとの共通／真偽別フィードバック混在などの既存機能を維持する。

## 主なファイル

| ファイル | 役割 |
| --- | --- |
| `app/mcq-webapp/index.html` | 画面構造 |
| `app/mcq-webapp/styles.css` | レイアウト・説明ポップアップ |
| `app/mcq-webapp/app.js` | 編集・CSV/XML処理 |
| `app/mcq-webapp/i18n.js` | UI翻訳 |
| `app/mcq-webapp/server.py` | ローカルサーバー・CAS連携 |
| `scripts/mcq-webapp.py` | セットアップ・サービス管理・Docker起動 |
| `scripts/tests/test_docker_startup.py` | Docker起動の単体テスト |

## 再開と検証

プレビュー機能の検証（実API確認は起動中のWebAppとSTACK APIが必要）:

```sh
node scripts/tests/test_preview_ui.cjs
node scripts/tests/test_variant_parameters.cjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v
python3 scripts/tests/check_stack_preview_integration.py --url http://127.0.0.1:4174
```

実API確認時は既存サービスを変更せず、`python3 app/mcq-webapp/server.py --port 4174` で検証用サーバーを別に起動した。通常の4173を使う場合は検証コマンドの `--url` を省略できる。統合検証にはNode.jsが必要で、生成した一時XMLは終了時に削除される。

パラメータ機能の検証:

- `node scripts/tests/test_variant_parameters.cjs` 成功。実際のrank 0/1/2 XMLを用いて読込、生成XMLの出力順、メタデータとCSV往復、評価コードの順序、重み付き正解数、共有／新規includeへ個別rank値を埋め込まないこと、旧メタデータを検証。
- 候補数・旧XMLのNode回帰テスト、Python単体テスト10件、JS構文検査、差分チェックが成功。
- 実ブラウザで問題文上のパラメータ欄、入力のXML反映順、英語表示を確認。実Maximaでrank別の数値結果が一致することまでは今回確認していない。

リポジトリのルートで状態とブランチを確認する。未コミット変更や分岐がある場合は内容を保護し、強制的に上書きしない。

```sh
git status --short --branch
git log -5 --oneline
```

初回は `make setup`、設定済みなら `make start`。既定の画面URLは `http://127.0.0.1:4173/`。`make check setup` とまとめるとcheck失敗でsetupが実行されないため、セットアップは単独で実行する。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v
git diff --check
```

- `d94cc56` の検証では単体テスト8件と差分チェックが成功。
- 単体テストは外部処理を模擬して、接続済み・起動待ち・起動失敗・時間切れ・未導入・OSによる分岐・診断時の非起動を確認。実際のDocker Desktop起動を直接テストするものではない。
- 利用者によるMacでのセットアップ・WebApp起動は成功。ただし、停止状態からのDocker自動起動が実際に通ったかは個別には未確認。
- 説明ポップアップのブラウザによる詳細な表示検証は未完了。次のUI確認時に、ホバー／フォーカスでの表示、非操作時の非表示、日英切替、狭い画面での収まり、問題文の編集とXML生成を確認する。

候補数の修正時の検証:

- `node scripts/tests/test_choice_capacity.cjs` 成功。選択肢数6が未評価時にも維持され、正解4件・誤答13件の評価後は合計上限17、正解数候補0〜4で固定真偽モードの生成が通ることを確認。正解5件や誤答不足、実際の出題選択肢数を超える正解数は引き続き拒否する。再評価待ちでも入力値を維持。
- 既存XMLのNode回帰テスト、JS構文検査、差分チェックが成功。今回の修正はブラウザでは未検証。

キャッシュ対策時の検証:

- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v` で10件成功（アセット再検証・APIヘッダー維持を含む）。既存XMLのNode回帰テストと `git diff --check` も成功。

既存XMLの候補型修正時の検証:

- `node scripts/tests/test_legacy_xml_import.cjs` 成功。製品の読込ヘルパーを使い、リスト直接代入・単一要素・空リスト・リスト変数・map式・添字・多言語・フィードバック・旧ランダム化XMLを確認。`001/*.txt` の実データ176代入について式全体の保持とCSV型 `cas_list` を検証。
- `node --check app/mcq-webapp/app.js` と `git diff --check` 成功。
- ブラウザでのXML読込から実際のCAS評価までの一連の検証は今回未実施。

サンプル統合時の検証:

- `python3 app/mcq-webapp/samples.ja/validate_samples.py` で60問の構造・BOM・ID・真偽ペアなどを検証。
- `python3 app/mcq-webapp/samples.ja/generate_samples.py` 実行前後で全60CSVの内容が不変であることを確認。
- 移動前の60CSVとのバイト一致、旧看護10件との問題ID以外の一致、差分チェックを確認。ブラウザでのCSV読込は今回未実施。

## 複数Mac・共同開発の運用

- 開発用cloneはNextcloudなどの同期フォルダ外に置く。Nextcloudはバックアップ用とする。
- Mac切替前に変更とこのメモをコミットしてpushし、移動先では編集前に取得する。同じ変更を複数Macで同時に進めない。
- Codexには移動先のcloneを開かせ、この文書を読むよう依頼する。Gitでは会話履歴や未追跡ファイルは移動しない。
- 各Macで環境をセットアップする。ローカル設定、生成キャッシュ、認証情報は共有しない。
- 旧同期フォルダに独自コミット・未コミット変更・未追跡の問題データが残っている。必要なデータの選別移行は未完了。旧フォルダ全体や `.git` を最新版へ上書きせず、必要になった時に所有者と確認して比較・移行する。

## 更新時に残す情報

実装内容、設計上の決定、関連コミット、実施した検証と結果、未確認事項、次の作業を簡潔に更新する。完了した課題は未完了一覧から外し、過去の状態を現在の事実として残さない。公開文書のため、個人の絶対パス、認証情報、非公開の問題・個人情報は記載しない。
