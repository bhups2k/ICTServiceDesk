// -------- START CODE
// ==UserScript==
// @name         ServiceNow Comments & Close Notes Auto-Replacer (multi-field)
// @namespace    https://imperial.ac.uk/
// @version      1.4
// @description  Replace placeholders in Additional Comments and Close Notes textboxes with correct field values for Incident and Case.
// @match        https://servicemgt.imperial.ac.uk/*
// @match        https://servicemgt.service-now.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Textboxes to monitor
    const TEXTBOX_IDS = [
        "activity-stream-comments-textarea",
        "incident.close_notes",
        "sn_customerservice_case.close_notes"
    ];

    // Field selector sets for each table type
    const FIELD_SETS = {
        incident: {
            "[Customer]": "#sys_display\\.incident\\.caller_id",
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.incident\\.number",
            "[Your Full Name]": "#sys_display\\.incident\\.assigned_to"
        },
        case: {
            "[Customer]": "#sys_display\\.sn_customerservice_case\\.u_opened_for",
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.sn_customerservice_case\\.number",
            "[Your Full Name]": "#sys_display\\.sn_customerservice_case\\.assigned_to"
        }
    };

    // Determine record type
    function getRecordType() {
        if (document.querySelector("#sys_display\\.incident\\.caller_id")) return "incident";
        if (document.querySelector("#sys_display\\.sn_customerservice_case\\.u_opened_for")) return "case";
        return null;
    }

    // Safely read field values
    function getFieldValue(selector) {
        const el = document.querySelector(selector);
        return el ? el.value.trim() : "";
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function doReplacement(textarea) {
        const recordType = getRecordType();
        if (!recordType) return;

        const replacements = FIELD_SETS[recordType];
        let text = textarea.value;
        let updated = text;

        for (const [placeholder, selector] of Object.entries(replacements)) {
            const fieldValue = getFieldValue(selector);
            if (fieldValue) {
                const regex = new RegExp(escapeRegExp(placeholder), "g");
                updated = updated.replace(regex, fieldValue);
            }
        }

        if (updated !== text) {
            textarea.value = updated;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    function initWatcher(textarea) {
        if (!textarea || textarea.dataset.snowWatcherAttached === "true") return;
        textarea.dataset.snowWatcherAttached = "true";

        textarea.addEventListener("input", () => doReplacement(textarea));
        console.log(`[UserScript] Watching #${textarea.id} for replacements...`);

        // Initial check for pre-filled content
        setTimeout(() => doReplacement(textarea), 200);
    }

    // Observe DOM mutations to catch dynamically added fields
    const observer = new MutationObserver(() => {
        TEXTBOX_IDS.forEach(id => {
            const textarea = document.getElementById(id);
            if (textarea) initWatcher(textarea);
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial pass
    TEXTBOX_IDS.forEach(id => {
        const textarea = document.getElementById(id);
        if (textarea) initWatcher(textarea);
    });
})();

// -------- END CODE
