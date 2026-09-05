<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Site settings for the MCQ WebApp access plugin.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_mcqwebapp',
        get_string('pluginname', 'local_mcqwebapp')
    );
    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configcheckbox(
        'local_mcqwebapp/enabled',
        get_string('enabled', 'local_mcqwebapp'),
        get_string('enabled_desc', 'local_mcqwebapp'),
        0
    ));

    $settings->add(new admin_setting_configtext(
        'local_mcqwebapp/courseid',
        get_string('courseid', 'local_mcqwebapp'),
        get_string('courseid_desc', 'local_mcqwebapp'),
        0,
        PARAM_INT
    ));

    $settings->add(new admin_setting_configtext(
        'local_mcqwebapp/toolurl',
        get_string('toolurl', 'local_mcqwebapp'),
        get_string('toolurl_desc', 'local_mcqwebapp'),
        $CFG->wwwroot . '/mcq-webapp/',
        PARAM_URL
    ));
}
