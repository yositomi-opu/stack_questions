# stack_questions

**English** | [日本語](README.ja.md)

A collection of linear algebra and calculus questions and Maxima libraries for the STACK question type in Moodle. The repository also includes a WebApp for creating multiple-choice questions (MCQs) from CSV files or an editor and exporting XML for Moodle.

## Use the authoring apps

Install Git, Python 3.10 or later, Make, Docker, and Docker Compose. Docker Desktop can be used on macOS and Windows. See the [WebApp guide](app/mcq-webapp/README.md) (Japanese) for platform-specific setup instructions.

Run the initial setup from the repository root:

```sh
make setup
```

Setup starts all three apps:

| App | URL |
| --- | --- |
| MCQ WebApp | [http://localhost:4173/](http://localhost:4173/) |
| PRT Template WebApp (Tree/Chain) | [http://localhost:4175/](http://localhost:4175/) |
| STACK Edit WebApp (general XML editor) | [http://localhost:4176/](http://localhost:4176/) |

Edit MCQs or PRT templates and save CSV/XML. STACK API runs on port 3080 for rendering and grading. Use “Evaluate question variables” in MCQ to check formulas and random variables.

For later sessions, use `make start`, `make stop`, `make restart` and `make status` to manage all three apps; use `make check` to diagnose the MCQ/STACK API environment. Save work in every editor before restarting. On macOS, startup also launches Docker Desktop when needed. Run these commands as your normal user without `sudo`.

If evaluation fails with `/workspace/.../evaluate.mac not found` after moving or recreating a clone, run `make repair-docker` from the clone you intend to use. This recreates the containers with that clone mounted, restarts the WebApp, and verifies Maxima evaluation. Cached images and repository files are retained; container temporary state is reset. Save browser edits first. See the troubleshooting FAQ in the [WebApp guide](app/mcq-webapp/README.md).

If question variables are loaded from a separate file using `stack_include`, publish that file at a URL accessible to Moodle. The [WebApp guide](app/mcq-webapp/README.md) explains how to configure the URL and create variants using parameters such as matrix rank.

## PRT Template WebApp

Run `make prt-template-webapp` and open [http://127.0.0.1:4175/](http://127.0.0.1:4175/) for the standalone Tree/Chain STACK editor. It also accepts editing sessions opened by Moodle Qbank on a separate localhost port. See the [PRT Template WebApp guide](app/prt-template-webapp/README.md).

## Guest practice site

A separate practice server can render and grade teacher-registered CSV/XML questions without Moodle or student accounts. It reuses STACK API and does not expose the editor or arbitrary question-code endpoints. Scores are not stored. See the [Ubuntu VPS deployment guide (Japanese)](deploy/practice/README.md).

## Samples and main files

| Location | Contents |
| --- | --- |
| [app/mcq-webapp](app/mcq-webapp/) | MCQ editor and XML generator |
| [app/mcq-webapp/samples.ja](app/mcq-webapp/samples.ja/) | 60 Japanese CSV samples covering nursing, civil law, economics, statistics, research ethics, and information/AI literacy |
| [001](001/) | Mathematics MCQs and their question-variable files |
| [005](005/) | Drill exercises with numerical or algebraic input |
| [010](010/) | Exercises with explanations for classroom use |
| [001.MCQ-rb.xml](001.MCQ-rb.xml) / [001.MCQ-cb.xml](001.MCQ-cb.xml) | Radio and Checkbox XML templates |

Open a CSV sample using “Load CSV/XLSX” in the WebApp. Review and adapt its content to your teaching objectives before use.

## Author questions

Design MCQs around the concept being assessed and the misconceptions learners may have. When options only distinguish simple calculation mistakes, numerical or algebraic input may be more appropriate.

The WebApp supports both randomized true/false pairs and separate pools of correct and incorrect options. You can specify the selection criterion yourself, for example `__SELTYPE__ matrices of rank 1.` The placeholder becomes “Choose”, “Choose all”, or “Choose one of the” according to the settings. See the [selection-instruction guide](app/mcq-webapp/README.md#選択指示のプレースホルダー) for details.

For examples of authoring directly in Maxima, see [001/Sample.txt](001/Sample.txt).

### Multiple languages

The WebApp can prepare translations from a base language for review and editing. Supported languages are English, Japanese, French, Italian, German, Portuguese, Chinese, Korean, Russian, and Swedish.

When authoring directly in Maxima, define question text and feedback as language-code/text pairs. For example:

```maxima
%__mcq_qtextL:[["ja", "次の主張について正しいものを __SELTYPE__。"],
              ["en", "__SELTYPE__ correct statements."]];
```

Use `%__CoptL1L` and `%__WoptL1L` for language-specific options, or `%__CoptL1` and `%__WoptL1` for language-independent candidate lists. See [001/Sample.txt](001/Sample.txt) for examples. After translation, check that the meaning and formula display are preserved.

## For server administrators

See the [Moodle integration and administration guide](deploy/moodle-auth/README.md) for restricting WebApp access to teachers logged in to Moodle and for creating and managing workshop accounts in bulk.

## Build the linear algebra libraries

Run `make` to generate `.mac` files from `genmatrix_lib.txt`, `trans_mat.txt`,
`rref_lib.txt`, `polynomial_disp.txt`, `texput_W.txt`, and `linalg_misc.txt`.
It also concatenates these sources, in that order, into `ky_linear_algebra.txt`
and their generated `.mac` files into `ky_linear_algebra.mac` for compatibility.
Edit the six source files; edits to the combined files are overwritten when rebuilt.
Use `make ky_linear_algebra.mac` to rebuild just these libraries and both combined files.

## Contribute to development

[HANDOFF.md](HANDOFF.md) records the current development state, validation results, and outstanding work. [AGENTS.md](AGENTS.md) provides instructions for development agents. Both are currently in Japanese. See [LICENSE](LICENSE) for licensing terms.

## Batch commands

Convert multiple MCQ CSV files without opening the WebApp, then combine XML files under one category in a single Moodle XML file. Upload it through Moodle’s normal import page. See the [batch command guide](scripts/README.batch.md).

`make setup` and `make start` start MCQ WebApp (4173), PRT Template WebApp (4175) and STACK Edit WebApp (4176). `make stop`, `make restart` and `make status` manage these applications together. Existing `make stack-editor` remains an alias for `make prt-template-webapp`. Qbank identifies originating applications from metadata stored in question variables and transfers XML content through localhost sessions.
