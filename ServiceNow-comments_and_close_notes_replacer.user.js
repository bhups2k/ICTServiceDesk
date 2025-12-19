// -------- START CODE
// ==UserScript==
// @name         ServiceNow Comments & Close Notes Auto-Replacer (multi-field, auto-run)
// @namespace    https://imperial.ac.uk/
// @version      1.5.6
// @description  Automatically replace placeholders in Additional Comments and Close Notes textboxes with correct field values for Incident, Case, and RITM without needing to type.
// @author       Bhups Patel
// @match        https://servicemgt.imperial.ac.uk/*
// @match        https://servicemgt.service-now.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://github.com/bhups2k/ICTServiceDesk/raw/refs/heads/main/ServiceNow-comments_and_close_notes_replacer.user.js
// @downloadURL  https://github.com/bhups2k/ICTServiceDesk/raw/refs/heads/main/ServiceNow-comments_and_close_notes_replacer.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Textboxes to monitor
    const TEXTBOX_IDS = [
        "activity-stream-comments-textarea",
        "incident.close_notes",
        "sn_customerservice_case.close_notes"
    ];

    // ------------------------------------------------------------------------------------------------------------------

    const TEXTAREA_ID = "activity-stream-comments-textarea";
    const MESSAGE_BUTTON = "sn-auto-comment-btn";
    const COMMENT_TEXT =
`Hello [Customer],



Kind regards,
[Your Full Name]
1st Line Support Team`;

    function addButton() {
        const textarea = document.getElementById(TEXTAREA_ID);
        if (!textarea) return;

        // Avoid duplicates
        if (document.getElementById(MESSAGE_BUTTON)) return;

        const container = textarea.closest(".sn-stream-textarea-container");
        if (!container) return;

        const btnMessage = document.createElement("button");
        btnMessage.id = MESSAGE_BUTTON;
        btnMessage.type = "button";
        btnMessage.textContent = "Message";

        btnMessage.style.marginTop = "6px";
        btnMessage.style.padding = "6px 12px";
        btnMessage.style.fontSize = "12px";
        btnMessage.style.cursor = "pointer";

        btnMessage.addEventListener("click", () => {
            textarea.value = COMMENT_TEXT;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            // 1️⃣ Set state = "On Hold" (incident.state select)
            setSelectByLabel("incident.state", "On Hold");

            // 2️⃣ Set hold reason = "Awaiting Caller" (incident.hold_reason select)
            setSelectByLabel("incident.hold_reason", "Awaiting Caller");

            // 3️⃣ Set follow-up date = today + 3 days
            setFollowUpDate(3);

            console.log("[UserScript] Message inserted, state set to On Hold, hold reason Awaiting Caller");
        });

        // Insert AFTER the entire textarea container
        container.insertAdjacentElement("afterend", btnMessage);

        console.log("[UserScript] Insert message button added");
    }

    function setSelectByLabel(selectId, labelText) {
        const select = document.getElementById(selectId);
        if (!select) {
            console.warn(`[UserScript] Select #${selectId} not found`);
            return;
        }

        const options = Array.from(select.options);
        const match = options.find(opt => opt.text.trim() === labelText.trim());

        if (!match) {
            console.warn(`[UserScript] Option "${labelText}" not found in #${selectId}`);
            return;
        }

        if (select.value === match.value) {
            return; // No change needed
        }

        select.value = match.value;

        // Trigger ServiceNow onchange and listeners
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));
        console.log(`[UserScript] Set #${selectId} to "${labelText}" (value=${match.value})`);
    }

    function setFollowUpDate(daysToAdd) {
        // Initialize followUp to null
        let followUp = null;

        // Check if incident follow-up exists and assign
        const incFollowUp = document.getElementById("incident.follow_up");
        if (incFollowUp) {
            followUp = incFollowUp;
        }

        // Otherwise, check if case follow-up exists and assign
        const csFollowUp = document.getElementById("sn_customerservice_case.follow_up");
        if (csFollowUp) {
            followUp = csFollowUp;
        }

        // If neither exists, exit
        if (!followUp) {
            console.warn("No follow-up field found.");
            return;
        }

        const now = new Date();
        now.setDate(now.getDate() + daysToAdd);

        const pad = n => String(n).padStart(2, "0");

        const formatted =
            pad(now.getDate()) + "/" +
            pad(now.getMonth() + 1) + "/" +
            now.getFullYear() + " 10:00:00";

        followUp.value = formatted;

        // Trigger ServiceNow listeners
        followUp.dispatchEvent(new Event("input", { bubbles: true }));
        followUp.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[UserScript] Follow-up date set to", formatted);
    }

    // ServiceNow-safe polling (very lightweight)
    /*const interval = setInterval(() => {
        addButton();

        // Stop once button exists
        if (document.getElementById(MESSAGE_BUTTON)) {
            clearInterval(interval);
        }
    }, 500); */
    const interval = setInterval(() => {
        addButton(); // your Message button
        addAssignMeButton(); // new unified Assign to me button

        if (document.getElementById(MESSAGE_BUTTON) &&
            document.getElementById(ASSIGN_ME_BUTTON_ID)) {
            clearInterval(interval);
        }
    }, 500);

    // ------------------------------------------------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------------------------------------
    function setReferenceField(displayId, displayValue, hiddenId, hiddenValue) {
        const displayEl = document.getElementById(displayId);
        if (!displayEl) {
            console.warn(`[UserScript] Display element #${displayId} not found`);
            return;
        }

        displayEl.value = displayValue;

        // Update hidden field if provided
        if (hiddenId && hiddenValue !== undefined) {
            const hiddenEl = document.getElementById(hiddenId);
            if (hiddenEl) {
                hiddenEl.value = hiddenValue;
                hiddenEl.dispatchEvent(new Event("change", { bubbles: true }));
                hiddenEl.dispatchEvent(new Event("input", { bubbles: true }));
            } else {
                console.warn(`[UserScript] Hidden element #${hiddenId} not found`);
            }
        }

        // Trigger events on the display field so SN autocomplete/reference logic runs
        displayEl.dispatchEvent(new Event("change", { bubbles: true }));
        displayEl.dispatchEvent(new Event("input", { bubbles: true }));
        displayEl.dispatchEvent(new Event("blur", { bubbles: true }));

        console.log(`[UserScript] Set reference #${displayId} to "${displayValue}"`);
    }

    const ASSIGN_ME_BUTTON_ID = "sn-assign-me-btn";

    function addAssignMeButton() {
        const recordType = getRecordType();
        if (!recordType) return;

        // Determine IDs per table
        let assignedToDisplayId, assignedToHiddenId, groupDisplayId, groupHiddenId;

        if (recordType === "incident") {
            assignedToDisplayId = "sys_display.incident.assigned_to";
            assignedToHiddenId = "incident.assigned_to";
            groupDisplayId = "sys_display.incident.assignment_group";
            groupHiddenId = "incident.assignment_group";
        } else if (recordType === "case") {
            assignedToDisplayId = "sys_display.sn_customerservice_case.assigned_to";
            assignedToHiddenId = "sn_customerservice_case.assigned_to";
            groupDisplayId = "sys_display.sn_customerservice_case.assignment_group";
            groupHiddenId = "sn_customerservice_case.assignment_group";
        } else {
            return; // not incident/case; ignore (e.g. RITM)
        }

        const assignedToDisplay = document.getElementById(assignedToDisplayId);
        if (!assignedToDisplay) {
            return; // field not rendered yet
        }

        // Prevent duplicate button
        if (document.getElementById(ASSIGN_ME_BUTTON_ID)) {
            return;
        }

        const container = assignedToDisplay.closest(".input-group.ref-container")
        || assignedToDisplay.closest(".form-field");
        if (!container) {
            console.warn("[UserScript] Could not find container for Assigned to field");
            return;
        }

        const btn = document.createElement("button");
        btn.id = ASSIGN_ME_BUTTON_ID;
        btn.type = "button";
        btn.textContent = "Assign to me";

        btn.style.marginTop = "6px";
        btn.style.padding = "6px 12px";
        btn.style.fontSize = "12px";
        btn.style.cursor = "pointer";
        btn.style.display = "block";

        btn.addEventListener("click", () => {
            console.log("[UserScript] Assign to me clicked for", recordType);

            // Always assign to Service Desk / Bhups Patel for now
            const SERVICE_DESK_SYS_ID = "d625dccec0a8016700a222a0f7900d06";
            const BHUPS_PATEL_SYS_ID  = "7921a38f1b8ef0100a368551f54bcb41";

            // 1️⃣ Assignment group → Service Desk
            setReferenceField(
                groupDisplayId,
                "Service Desk",
                groupHiddenId,
                SERVICE_DESK_SYS_ID
            );

            // 2️⃣ Assigned to → Bhups Patel
            setReferenceField(
                assignedToDisplayId,
                "Bhups Patel",
                assignedToHiddenId,
                BHUPS_PATEL_SYS_ID
            );
        });

        // Insert button under the Assigned to field
        container.insertAdjacentElement("afterend", btn);

        console.log("[UserScript] Assign to me button added for", recordType);
    }
    // ------------------------------------------------------------------------------------------------------------------
    // Field selector sets for each table type
    const COMMON_FIELDS = {
        "[Your Full Name]": () => window.NOW?.user_display_name || "",
        "[your full name]": () => window.NOW?.user_display_name || ""
    };

    const FIELD_SETS = {
        incident: {
            "[Customer]": "#sys_display\\.incident\\.caller_id",
            "[customer]": "#sys_display\\.incident\\.caller_id",
            "<user>": "#sys_display\\.incident\\.caller_id",
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.incident\\.number",
            ...COMMON_FIELDS
        },
        case: {
            "[Customer]": "#sys_display\\.sn_customerservice_case\\.u_opened_for",
            "[customer]": "#sys_display\\.sn_customerservice_case\\.u_opened_for",
            "<user>": "#sys_display\\.sn_customerservice_case\\.u_opened_for",
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.sn_customerservice_case\\.number",
            ...COMMON_FIELDS
        },
        ritm: {
            "[Customer]": "#sys_display\\.sc_req_item\\.request\\.requested_for",
            "[customer]": "#sys_display\\.sc_req_item\\.request\\.requested_for",
            "<user>": "#sys_display\\.sc_req_item\\.request\\.requested_for",
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.sc_req_item\\.number",
            ...COMMON_FIELDS
        }
    };

    function getRecordType() {
        if (document.querySelector("#sys_display\\.incident\\.caller_id")) return "incident";
        if (document.querySelector("#sys_display\\.sn_customerservice_case\\.u_opened_for")) return "case";
        if (document.querySelector("#sys_display\\.sc_req_item\\.request\\.requested_for")) return "ritm";
        return null;
    }

    function getFieldValue(selectorOrFn) {
        if (typeof selectorOrFn === "function") {
            return selectorOrFn() || "";
        }
        const el = document.querySelector(selectorOrFn);
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

        for (const [placeholder, selectorOrFn] of Object.entries(replacements)) {
            const fieldValue = getFieldValue(selectorOrFn);
            if (fieldValue) {
                const regex = new RegExp(escapeRegExp(placeholder), "g");
                updated = updated.replace(regex, fieldValue);
            }
        }

        if (updated !== text) {
            textarea.value = updated;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            console.log(`[UserScript] Auto-replaced content in #${textarea.id}`);
        }
    }

    function initWatcher(textarea) {
        if (!textarea || textarea.dataset.snowWatcherAttached === "true") return;

        textarea.dataset.snowWatcherAttached = "true";
        console.log(`[UserScript] Watching #${textarea.id} for automatic replacements...`);

        // Run automatically every 0.5 seconds for dynamic ServiceNow updates
        const interval = setInterval(() => {
            if (!document.body.contains(textarea)) {
                clearInterval(interval);
                return;
            }
            doReplacement(textarea);
        }, 500);
    }

    // Observe DOM mutations to catch dynamically added textareas
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
