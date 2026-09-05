<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace stack_questions\moodle_support;

/**
 * Write workshop credentials outside the web root for administration and printing.
 *
 * @package   stack_questions
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class credential_exporter {
    /** @var string Credential output directory. */
    private string $directory;

    /**
     * @param string $directory output directory under Moodle data
     */
    public function __construct(string $directory) {
        $this->directory = rtrim($directory, DIRECTORY_SEPARATOR);
    }

    /**
     * Create and verify the private output directory before database changes.
     */
    public function prepare_directory(): void {
        if (is_link($this->directory)) {
            throw new \coding_exception('Credential output directory must not be a symbolic link.');
        }
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new \coding_exception("Could not create credential directory: {$this->directory}");
        }
        if (!chmod($this->directory, 0700)) {
            throw new \coding_exception("Could not protect credential directory: {$this->directory}");
        }
        clearstatcache(true, $this->directory);
        if (!is_writable($this->directory) || (fileperms($this->directory) & 0777) !== 0700) {
            throw new \coding_exception("Credential directory is not private and writable: {$this->directory}");
        }
    }

    /**
     * Write an administrator CSV and A4 cut-apart HTML cards.
     *
     * @param array<int, array<string, mixed>> $accounts prepared credentials
     * @param array<string, string> $metadata course and login details
     * @return array{csv: string, html: string}
     */
    public function export(array $accounts, array $metadata): array {
        if (!$accounts) {
            throw new \coding_exception('There are no credentials to export.');
        }
        $this->prepare_directory();

        $first = reset($accounts);
        $last = end($accounts);
        $prefix = preg_replace('/[^a-z0-9_-]/', '-', strtolower($metadata['prefix']));
        $stamp = date('Ymd-His') . '-' . bin2hex(random_bytes(3));
        $basename = sprintf(
            '%s-%03d-%03d-%s',
            $prefix,
            $first['number'],
            $last['number'],
            $stamp
        );
        $paths = [
            'csv' => $this->directory . DIRECTORY_SEPARATOR . $basename . '.csv',
            'html' => $this->directory . DIRECTORY_SEPARATOR . $basename . '.html',
        ];

        try {
            $this->write_csv($paths['csv'], $accounts, $metadata);
            $html = $this->build_html($accounts, $metadata);
            $this->write_string($paths['html'], $html);
        } catch (\Throwable $error) {
            $this->delete_files($paths);
            throw $error;
        }
        return $paths;
    }

    /**
     * Remove exported files after a failed account transaction.
     *
     * @param array<string, string> $paths exported paths
     */
    public function delete_files(array $paths): void {
        foreach ($paths as $path) {
            if (is_string($path) && is_file($path)) {
                unlink($path);
            }
        }
    }

    /**
     * Write the administrator CSV atomically.
     *
     * @param string $path final path
     * @param array<int, array<string, mixed>> $accounts credentials
     * @param array<string, string> $metadata course details
     */
    private function write_csv(string $path, array $accounts, array $metadata): void {
        $this->write_atomic($path, function ($handle) use ($accounts, $metadata): void {
            fputcsv(
                $handle,
                ['number', 'username', 'password', 'idnumber', 'initial_status', 'courseid', 'role'],
                ',',
                '"',
                ''
            );
            foreach ($accounts as $account) {
                fputcsv($handle, [
                    $account['number'],
                    $account['username'],
                    $account['password'],
                    $account['idnumber'],
                    $account['active'] ? 'active' : 'suspended',
                    $metadata['courseid'],
                    $metadata['role'],
                ], ',', '"', '');
            }
        });
    }

    /**
     * Build a printable document containing ten cards per A4 page.
     *
     * @param array<int, array<string, mixed>> $accounts credentials
     * @param array<string, string> $metadata course and login details
     * @return string
     */
    private function build_html(array $accounts, array $metadata): string {
        $title = $this->escape($metadata['title']);
        $coursename = $this->escape($metadata['coursename']);
        $loginurl = $this->escape($metadata['loginurl']);
        $total = count($accounts);
        $pages = '';
        $position = 0;
        foreach (array_chunk($accounts, 10) as $pageaccounts) {
            $cards = '';
            foreach ($pageaccounts as $account) {
                $position++;
                $username = $this->escape($account['username']);
                $idnumber = $this->escape($account['idnumber']);
                $password = $this->escape($account['password']);
                $cards .= <<<HTML
                    <section class="card">
                      <div class="event">{$title}</div>
                      <div class="course">{$coursename}</div>
                      <div class="label">ログインID</div>
                      <div class="credential">{$username}</div>
                      <div class="admin-id">管理番号: {$idnumber}</div>
                      <div class="label password-label">パスワード</div>
                      <div class="credential">{$password}</div>
                      <div class="case-note">英字の大文字・小文字を区別します</div>
                      <div class="login-url">{$loginurl}</div>
                      <div class="instruction">
                        Moodleへログインし、コース内の「STACK MCQ XML生成」を開いてください。
                      </div>
                      <div class="sequence">{$position} / {$total}</div>
                    </section>
                    HTML;
            }
            $pages .= "<main class=\"page\">{$cards}</main>\n";
        }

        return <<<HTML
            <!doctype html>
            <html lang="ja">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>{$title} ログインカード</title>
              <style>
                @page { size: A4 portrait; margin: 10mm; }
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; background: #fff; color: #111; }
                body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif; }
                .page {
                  width: 190mm;
                  height: 277mm;
                  display: grid;
                  grid-template-columns: repeat(2, 95mm);
                  grid-template-rows: repeat(5, 55.4mm);
                  break-after: page;
                  page-break-after: always;
                }
                .page:last-child { break-after: auto; page-break-after: auto; }
                .card {
                  position: relative;
                  overflow: hidden;
                  padding: 4mm 5mm;
                  border: 0.25mm dashed #777;
                  text-align: center;
                }
                .event { font-size: 10pt; font-weight: 700; line-height: 1.15; }
                .course { height: 4.5mm; overflow: hidden; font-size: 7.5pt; color: #333; }
                .label { margin-top: 1.4mm; font-size: 7.5pt; color: #333; }
                .password-label { margin-top: 1mm; }
                .credential {
                  font: 700 15pt/1.15 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                  letter-spacing: 0.5pt;
                  white-space: nowrap;
                }
                .admin-id { margin-top: 0.6mm; font-size: 6.5pt; color: #555; }
                .case-note { margin-top: 0.4mm; font-size: 6pt; color: #555; }
                .login-url { margin-top: 1mm; font-size: 6.5pt; overflow-wrap: anywhere; }
                .instruction { margin-top: 1mm; font-size: 6.5pt; line-height: 1.25; }
                .sequence { position: absolute; right: 3mm; bottom: 2mm; font-size: 6pt; color: #666; }
                @media screen {
                  body { background: #ddd; }
                  .page { margin: 8mm auto; background: #fff; box-shadow: 0 1mm 4mm #888; }
                }
                @media print { .page { margin: 0; } }
              </style>
            </head>
            <body>
            {$pages}</body>
            </html>
            HTML;
    }

    /**
     * Write a complete string atomically.
     *
     * @param string $path final path
     * @param string $content file content
     */
    private function write_string(string $path, string $content): void {
        $this->write_atomic($path, function ($handle) use ($content): void {
            $offset = 0;
            $length = strlen($content);
            while ($offset < $length) {
                $written = fwrite($handle, substr($content, $offset));
                if ($written === false || $written === 0) {
                    throw new \coding_exception('Could not write the complete credential file.');
                }
                $offset += $written;
            }
        });
    }

    /**
     * Write one private file without exposing a partially written final path.
     *
     * @param string $path final path
     * @param callable $writer callback receiving the writable resource
     */
    private function write_atomic(string $path, callable $writer): void {
        $temporary = $path . '.tmp-' . bin2hex(random_bytes(6));
        $handle = fopen($temporary, 'xb');
        if ($handle === false) {
            throw new \coding_exception("Could not create credential file: {$temporary}");
        }
        try {
            $writer($handle);
            if (!fflush($handle)) {
                throw new \coding_exception('Could not flush the credential file.');
            }
            if (function_exists('fsync') && !fsync($handle)) {
                throw new \coding_exception('Could not synchronise the credential file.');
            }
            fclose($handle);
            $handle = null;
            if (!chmod($temporary, 0600) || !rename($temporary, $path)) {
                throw new \coding_exception("Could not finish credential file: {$path}");
            }
            clearstatcache(true, $path);
            if ((fileperms($path) & 0777) !== 0600) {
                throw new \coding_exception("Credential file permissions are unsafe: {$path}");
            }
        } catch (\Throwable $error) {
            if (is_resource($handle)) {
                fclose($handle);
            }
            if (is_file($temporary)) {
                unlink($temporary);
            }
            throw $error;
        }
    }

    /**
     * Escape text for HTML.
     *
     * @param string $text untrusted text
     * @return string
     */
    private function escape(string $text): string {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
