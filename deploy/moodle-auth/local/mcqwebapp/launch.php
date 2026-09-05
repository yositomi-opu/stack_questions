<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Moodle login and capability-checked launcher for the MCQ WebApp.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

if (!\local_mcqwebapp\access::is_enabled()) {
    throw new moodle_exception('notenabled', 'local_mcqwebapp');
}

$course = \local_mcqwebapp\access::course();
$toolurl = \local_mcqwebapp\access::tool_url();
if ($course === null || $toolurl === '') {
    throw new moodle_exception('notconfigured', 'local_mcqwebapp');
}

require_login($course);
require_capability('moodle/question:add', context_course::instance($course->id));

redirect($toolurl);
