<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Create and activate or suspend anonymous workshop accounts.
 *
 * @package   stack_questions
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('CLI_SCRIPT', true);

$help = <<<'HELP'
Manage anonymous Moodle accounts for an MCQ WebApp workshop.

The default create action covers jspr26001 through jspr26100, initially
activating 001-020 and suspending 021-100. Moodle login names must be
lowercase; the matching Moodle ID numbers are uppercase (JSPR26001, etc.).

Options:
--action=ACTION          create, activate, suspend, or status (default: status)
--moodleroot=PATH        Moodle installation root
--courseid=ID            Moodle workshop course ID (default: 17)
--prefix=PREFIX          Lowercase login prefix (default: jspr26)
--start=N                First three-digit suffix (default: 1)
--end=N                  Last three-digit suffix (default: 100)
--activeend=N            Last initially active suffix for create (default: 20)
--role=SHORTNAME         Course role shortname (default: editingteacher)
--passwordlength=N       Requested password length, at least 12 (default: 14)
--lang=CODE              Account language code (default: ja)
--title=TEXT             Heading printed on credential cards
--confirm                Required for create, activate, and suspend
-h, --help               Show this help

Examples:
  php support/moodle/workshop_users.php --moodleroot=/path/to/moodle --action=create --courseid=17 --confirm
  php support/moodle/workshop_users.php --moodleroot=/path/to/moodle --action=status --courseid=17
  php support/moodle/workshop_users.php --moodleroot=/path/to/moodle --action=activate --start=21 --end=30 --confirm
  php support/moodle/workshop_users.php --moodleroot=/path/to/moodle --action=suspend --start=1 --end=30 --confirm

Credential CSV and printable A4 HTML files are written with mode 0600 below:
  <moodledata>/stack_questions/workshop_credentials/
HELP;

if (in_array('--help', $argv, true) || in_array('-h', $argv, true)) {
    fwrite(STDOUT, $help . PHP_EOL);
    exit(0);
}

$moodleroot = '/home/www/htdocs/moodle';
foreach ($argv as $argument) {
    if (str_starts_with($argument, '--moodleroot=')) {
        $moodleroot = substr($argument, strlen('--moodleroot='));
        break;
    }
}
$moodleroot = rtrim($moodleroot, DIRECTORY_SEPARATOR);
if (!is_readable($moodleroot . '/config.php')) {
    fwrite(STDERR, "Moodle config.php is not readable: {$moodleroot}/config.php\n");
    exit(1);
}

require($moodleroot . '/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir . '/enrollib.php');

// Keep repository files relative to the inherited working directory. The web
// user may work inside a private home but be unable to traverse its absolute path.
$supportlibrary = './support/moodle/lib';
if (!is_readable($supportlibrary . '/credential_exporter.php')
        || !is_readable($supportlibrary . '/workshop_user_manager.php')) {
    cli_error('Run this command from the stack_questions repository root.');
}
require_once($supportlibrary . '/credential_exporter.php');
require_once($supportlibrary . '/workshop_user_manager.php');

use stack_questions\moodle_support\credential_exporter;
use stack_questions\moodle_support\workshop_user_manager;

[$options, $unrecognised] = cli_get_params([
    'action' => 'status',
    'moodleroot' => $moodleroot,
    'courseid' => 17,
    'prefix' => 'jspr26',
    'start' => 1,
    'end' => 100,
    'activeend' => 20,
    'role' => 'editingteacher',
    'passwordlength' => 14,
    'lang' => 'ja',
    'title' => 'JSPR26 Workshop',
    'confirm' => false,
    'help' => false,
], [
    'h' => 'help',
]);

if ($options['help']) {
    cli_writeln($help);
    exit(0);
}
if ($unrecognised) {
    cli_error('Unknown option(s): ' . implode(', ', $unrecognised) . "\n\n" . $help);
}

$action = strtolower(trim((string)$options['action']));
$allowedactions = ['create', 'activate', 'suspend', 'status'];
if (!in_array($action, $allowedactions, true)) {
    cli_error("Invalid action: {$action}\n\n" . $help);
}
if ($action !== 'status' && !$options['confirm']) {
    cli_error("The {$action} action changes Moodle data. Review the range and add --confirm.");
}

try {
    $courseid = (int)$options['courseid'];
    $prefix = trim((string)$options['prefix']);
    $start = (int)$options['start'];
    $end = (int)$options['end'];
    $role = trim((string)$options['role']);
    $manager = new workshop_user_manager($courseid, $prefix, $role);

    if ($action === 'create') {
        $accounts = $manager->prepare_new_accounts(
            $start,
            $end,
            (int)$options['activeend'],
            (int)$options['passwordlength'],
            trim((string)$options['lang'])
        );
        $exporter = new credential_exporter($CFG->dataroot . '/stack_questions/workshop_credentials');
        $metadata = [
            'prefix' => $prefix,
            'courseid' => (string)$manager->course()->id,
            'role' => $manager->role()->shortname,
            'title' => trim((string)$options['title']),
            'coursename' => html_entity_decode(
                strip_tags(format_string($manager->course()->fullname, true, [
                    'context' => context_course::instance($manager->course()->id),
                ])),
                ENT_QUOTES | ENT_HTML5,
                'UTF-8'
            ),
            'loginurl' => $CFG->wwwroot . '/login/index.php',
        ];

        $paths = $exporter->export($accounts, $metadata);
        try {
            $manager->create_accounts($accounts);
        } catch (Throwable $error) {
            $exporter->delete_files($paths);
            throw $error;
        }

        $activecount = count(array_filter($accounts, fn(array $account): bool => $account['active']));
        $suspendedcount = count($accounts) - $activecount;
        cli_heading('Workshop accounts created');
        cli_writeln("Range: {$prefix}" . sprintf('%03d', $start) . '-' . sprintf('%03d', $end));
        cli_writeln("Active: {$activecount}; suspended: {$suspendedcount}");
        cli_writeln('Administrator CSV (mode 0600): ' . $paths['csv']);
        cli_writeln('Printable A4 HTML (mode 0600): ' . $paths['html']);
        cli_writeln('Passwords were written only to those two private files.');
        exit(0);
    }

    if ($action === 'activate' || $action === 'suspend') {
        $active = $action === 'activate';
        $manager->set_range_state($start, $end, $active);
        $verb = $active ? 'activated' : 'suspended';
        cli_heading("Workshop accounts {$verb}");
        cli_writeln("Range: {$prefix}" . sprintf('%03d', $start) . '-' . sprintf('%03d', $end));
        cli_writeln('Both Moodle account and course enrolment states were updated.');
        exit(0);
    }

    $rows = $manager->range_status($start, $end);
    cli_heading('Workshop account status');
    cli_writeln("Course: {$manager->course()->id} {$manager->course()->shortname}");
    cli_writeln("Role: {$manager->role()->shortname}");
    cli_writeln('No.' . "\t" . 'Username' . "\t" . 'Account' . "\t" . 'Course' . "\t" . 'Teacher');
    foreach ($rows as $row) {
        cli_writeln(sprintf(
            '%03d' . "\t" . '%s' . "\t" . '%s' . "\t" . '%s' . "\t" . '%s',
            $row['number'],
            $row['username'],
            $row['account'],
            $row['course'],
            $row['teacher']
        ));
    }
    $siteactive = count(array_filter($rows, fn(array $row): bool => $row['account'] === 'active'));
    $courseactive = count(array_filter($rows, fn(array $row): bool => $row['course'] === 'active'));
    $missing = count(array_filter($rows, fn(array $row): bool => $row['account'] === 'missing'));
    cli_writeln("Summary: site active={$siteactive}; course active={$courseactive}; missing={$missing}");
} catch (Throwable $error) {
    cli_error('Workshop account operation failed: ' . $error->getMessage());
}
