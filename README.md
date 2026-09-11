# stack_questions

**English** | [日本語](README.ja.md)

A collection of linear algebra and calculus questions and Maxima libraries for the STACK question type in Moodle. The repository also includes a WebApp for creating multiple-choice questions (MCQs) from CSV files or an editor and exporting XML for Moodle.

## Use the WebApp

Install Git, Python 3.10 or later, Make, Docker, and Docker Compose. Docker Desktop can be used on macOS and Windows. See the [WebApp guide](app/mcq-webapp/README.md) (Japanese) for platform-specific setup instructions.

Run the initial setup from the repository root:

```sh
make setup
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Edit question text, options, and feedback; save a CSV for further editing or export XML for Moodle. Use “Evaluate question variables” to check formulas and random variables.

For later sessions, use `make start` to start, `make stop` to stop, and `make check` to diagnose the environment. On macOS, startup also launches Docker Desktop when needed. Run these commands as your normal user without `sudo`.

If question variables are loaded from a separate file using `stack_include`, publish that file at a URL accessible to Moodle. The [WebApp guide](app/mcq-webapp/README.md) explains how to configure the URL and create variants using parameters such as matrix rank.

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

## Contribute to development

[HANDOFF.md](HANDOFF.md) records the current development state, validation results, and outstanding work. [AGENTS.md](AGENTS.md) provides instructions for development agents. Both are currently in Japanese. See [LICENSE](LICENSE) for licensing terms.
