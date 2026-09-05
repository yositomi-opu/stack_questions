<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * English strings for the MCQ WebApp access plugin.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['courseid'] = 'Workshop course ID';
$string['courseid_desc'] = 'Only users who can add questions in this course can open the WebApp. '
    . 'The course ID is the number in the course URL, for example /course/view.php?id=12.';
$string['enabled'] = 'Enable Moodle access control';
$string['enabled_desc'] = 'Show the launcher in the configured course and allow Nginx to authorise eligible Moodle sessions.';
$string['navlabel'] = 'STACK MCQ XML Generator';
$string['notconfigured'] = 'The MCQ WebApp course ID or URL has not been configured.';
$string['notenabled'] = 'Moodle access to the MCQ WebApp is disabled.';
$string['pluginname'] = 'MCQ WebApp access';
$string['privacy:metadata'] = 'The MCQ WebApp access plugin stores no personal data.';
$string['toolurl'] = 'WebApp URL';
$string['toolurl_desc'] = 'The externally visible HTTPS URL protected by Nginx. Keep the trailing slash, '
    . 'for example https://moodle.example.org/mcq-webapp/.';
