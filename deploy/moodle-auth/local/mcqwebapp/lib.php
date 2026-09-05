<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Navigation callbacks for the MCQ WebApp access plugin.
 *
 * @package   local_mcqwebapp
 * @copyright 2026 yositomi-opu
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Add the MCQ WebApp launcher to the configured course navigation.
 *
 * @param navigation_node $parentnode course navigation node
 * @param stdClass $course course record
 * @param context_course $context course context
 */
function local_mcqwebapp_extend_navigation_course(
    navigation_node $parentnode,
    stdClass $course,
    context_course $context
): void {
    if (!\local_mcqwebapp\access::is_enabled()) {
        return;
    }
    if ((int)$course->id !== \local_mcqwebapp\access::course_id()) {
        return;
    }
    if (!has_capability('moodle/question:add', $context)) {
        return;
    }

    $label = get_string('navlabel', 'local_mcqwebapp');
    $url = new moodle_url('/local/mcqwebapp/launch.php');
    $parentnode->add(
        $label,
        $url,
        navigation_node::TYPE_CUSTOM,
        null,
        'local_mcqwebapp',
        new pix_icon('i/edit', $label)
    );
}
