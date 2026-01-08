// ==UserScript==
// @name         ServiceNow Comments & Close Notes Auto-Replacer (multi-field, auto-run)
// @namespace    https://imperial.ac.uk/
// @version      1.5.9.2
// @description  Automatically replace placeholders in Additional Comments and Close Notes textboxes with correct field values for Incident, Case, and RITM without needing to type.
// @author       Bhups Patel
// @match        https://servicemgt.imperial.ac.uk/*
// @match        https://servicemgt.service-now.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://github.com/bhups2k/ICTServiceDesk/raw/refs/heads/main/ServiceNow-comments_and_close_notes_replacer.user.js
// @downloadURL  https://github.com/bhups2k/ICTServiceDesk/raw/refs/heads/main/ServiceNow-comments_and_close_notes_replacer.user.js
// ==/UserScript==

const debug = false;

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. CONSTANTS & CONFIG
    // -------------------------------------------------------------------------

    // Textareas to monitor for placeholder replacement
    const TEXTBOX_IDS = [
        "activity-stream-comments-textarea",
        "incident.close_notes",
        "sn_customerservice_case.close_notes"
    ];

    // Main comments textarea & Message button
    const TEXTAREA_ID   = "activity-stream-comments-textarea";
    const MESSAGE_BUTTON = "sn-auto-comment-btn";

    const COMMENT_TEXT =
`Hello [Customer],



Kind regards,
[Your Full Name]
1st Line Support Team`;

    // Follow-up +X days button
    const PLUS3_BUTTON_ID = "sn-plus3days-btn";

    // Mailbox RITM special-case
    const MAILBOXCHANGES_ITEM_VALUE          = "Shared mailbox / Role / Room account management";
    const MAILBOXCHANGES_MESSAGE_BUTTON_ID   = "sn-auto-mailbox-btn";

    // Assign to me button
    const ASSIGN_ME_BUTTON_ID = "sn-assign-me-btn";

    // Keep common name fields as you already do
    const COMMON_FIELDS = {
        "[Your Full Name]": () => window.NOW?.user_display_name || "",
        "[your full name]": () => window.NOW?.user_display_name || "",
        "<your name>":      () => window.NOW?.user_display_name || ""
    };

    // Build FIELD_SETS using the helper
    const FIELD_SETS = {
        incident: {
            // customer placeholders...buildCustomerFields("#sys_display\\.incident\\.caller_id"),
            ...buildCustomerFields("#sys_display\\.incident\\.caller_id"),
            // ticket number
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.incident\\.number",
            // common name placeholders...COMMON_FIELDS
            ...COMMON_FIELDS
        },

        case: {
            ...buildCustomerFields("#sys_display\\.sn_customerservice_case\\.u_opened_for"),
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.sn_customerservice_case\\.number",
            ...COMMON_FIELDS
              },

        ritm: {
            ...buildCustomerFields("#sys_display\\.sc_req_item\\.request\\.requested_for"),
            "REPLACEMEWITHTICKETNUMBER": "#sys_readonly\\.sc_req_item\\.number",
            ...COMMON_FIELDS
              }
    };

    // -------------------------------------------------------------------------
    // 2. RECORD TYPE & DATA HELPERS
    // -------------------------------------------------------------------------

    // Extract common “customer” mappings
    function buildCustomerFields(selector) {
        return {
            "[Customer]": selector,
            "[customer]": selector,
            "<customer>": selector,
            "<user>"   : selector
        };
    }

    function getRecordType() {
        if (document.querySelector("#sys_display\\.incident\\.caller_id"))                  return "incident";
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

    // Return mailbox account value from readonly questionsetreference field
    function getMailboxAccountValue() {
        const candidates = document.querySelectorAll(
            'input.questionsetreference.form-control.element_reference_input[readonly="readonly"]'
        );
        if (!candidates.length) {
            console.warn("[UserScript] No readonly questionsetreference account field found");
            return "";
        }

        // Takes the second value (index 1) – adjust if layout changes
        if (candidates.length < 2) {
            console.warn("[UserScript] Expected at least 2 account candidates, found", candidates.length);
            return "";
        }

        const accountInput = candidates[1];
        const value = (accountInput.value || "").trim();
        console.log("[UserScript] Detected account value:", value, "from", accountInput.id);
        return value;
    }

    // -------------------------------------------------------------------------
    // 3. SERVICENOW FIELD UTILITIES
    // -------------------------------------------------------------------------

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
                hiddenEl.dispatchEvent(new Event("input",  { bubbles: true }));
            } else {
                console.warn(`[UserScript] Hidden element #${hiddenId} not found`);
            }
        }

        // Trigger events on the display field so SN autocomplete/reference logic runs
        displayEl.dispatchEvent(new Event("change", { bubbles: true }));
        displayEl.dispatchEvent(new Event("input",  { bubbles: true }));
        displayEl.dispatchEvent(new Event("blur",   { bubbles: true }));

        console.log(`[UserScript] Set reference #${displayId} to "${displayValue}"`);
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

        if (select.value === match.value) return; // No change needed

        select.value = match.value;

        // Trigger ServiceNow onchange and listeners
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input",  { bubbles: true }));
        console.log(`[UserScript] Set #${selectId} to "${labelText}" (value=${match.value})`);
    }

    function setFollowUpDate(workingDaysToAdd) {
        let followUp = null;
    
        const incFollowUp = document.getElementById("incident.follow_up");
        if (incFollowUp) followUp = incFollowUp;
    
        const csFollowUp = document.getElementById("sn_customerservice_case.follow_up");
        if (csFollowUp) followUp = csFollowUp;
    
        if (!followUp) {
            console.warn("No follow-up field found.");
            return;
        }
    
        // Start from now
        const target = new Date();
        let daysRemaining = workingDaysToAdd;
    
        while (daysRemaining > 0) {
            target.setDate(target.getDate() + 1);
            const day = target.getDay(); // 0=Sun, 6=Sat
            if (day !== 0 && day !== 6) {
                daysRemaining--;
            }
        }
    
        const pad = n => String(n).padStart(2, "0");
    
        const formatted =
            pad(target.getDate()) + "/" +
            pad(target.getMonth() + 1) + "/" +
            target.getFullYear() + " 10:00:00";
    
        followUp.value = formatted;
    
        followUp.dispatchEvent(new Event("input",  { bubbles: true }));
        followUp.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[UserScript] Follow-up date (working days) set to", formatted);
    }

    function clearReference(displayId, hiddenId) {
        const displayEl = document.getElementById(displayId);
        const hiddenEl  = hiddenId ? document.getElementById(hiddenId) : null;

        if (displayEl) {
            displayEl.value = "";
            displayEl.dispatchEvent(new Event("input",  { bubbles: true }));
            displayEl.dispatchEvent(new Event("change", { bubbles: true }));
            displayEl.dispatchEvent(new Event("blur",   { bubbles: true }));
        }
        if (hiddenEl) {
            hiddenEl.value = "";
            hiddenEl.dispatchEvent(new Event("input",  { bubbles: true }));
            hiddenEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    // -------------------------------------------------------------------------
    // 4. AUTO-REPLACEMENT ENGINE
    // -------------------------------------------------------------------------

    function doReplacement(textarea) {
        const recordType = getRecordType();
        if (!recordType) return;

        const replacements = FIELD_SETS[recordType];
        let text    = textarea.value;
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
            textarea.dispatchEvent(new Event("input",  { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            console.log(`[UserScript] Auto-replaced content in #${textarea.id}`);
        }
    }

    // -------------------------------------------------------------------------
    // 5. UI BUTTON FEATURES
    // -------------------------------------------------------------------------

    // 5.1 Message button (generic comment + incident state/hold/follow-up)
    function addMessageButton() {
        const textarea = document.getElementById(TEXTAREA_ID);
        if (!textarea) return;

        if (document.getElementById(MESSAGE_BUTTON)) return;

        const container = textarea.closest(".sn-stream-textarea-container");
        if (!container) return;

        const btnMessage = document.createElement("button");
        btnMessage.id   = MESSAGE_BUTTON;
        btnMessage.type = "button";
        btnMessage.textContent = "Message";

        btnMessage.style.marginTop  = "6px";
        btnMessage.style.padding    = "6px 12px";
        btnMessage.style.fontSize   = "12px";
        btnMessage.style.cursor     = "pointer";

        btnMessage.addEventListener("click", () => {
            textarea.value = COMMENT_TEXT;
            textarea.dispatchEvent(new Event("input",  { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            setSelectByLabel("incident.state",       "On Hold");
            setSelectByLabel("incident.hold_reason", "Awaiting Caller");
            setFollowUpDate(3);

            console.log("[UserScript] Message inserted, state set to On Hold, hold reason Awaiting Caller");
        });

        container.insertAdjacentElement("afterend", btnMessage);
        console.log("[UserScript] Insert message button added");
    }

    // 5.2 Mailbox changes button (RITM special case)
    function addMailboxChangesButton() {
        const textarea = document.getElementById("activity-stream-comments-textarea");
        if (!textarea) return;

        const catItemDisplay = document.getElementById("sys_display.sc_req_item.cat_item");
        if (!catItemDisplay) return;

        const itemValue = (catItemDisplay.value || "").trim();
        if (itemValue !== MAILBOXCHANGES_ITEM_VALUE) {
            const existing = document.getElementById(MAILBOXCHANGES_MESSAGE_BUTTON_ID);
            if (existing) existing.remove();
            return;
        }

        if (document.getElementById(MAILBOXCHANGES_MESSAGE_BUTTON_ID)) return;

        const container = textarea.closest(".sn-stream-textarea-container");
        if (!container) return;

        const messageButton = document.getElementById(MESSAGE_BUTTON);

        const btn = document.createElement("button");
        btn.id   = MAILBOXCHANGES_MESSAGE_BUTTON_ID;
        btn.type = "button";
        btn.textContent = "Mailbox message";

        btn.style.marginTop  = "6px";
        btn.style.marginLeft = "6px";
        btn.style.padding    = "6px 12px";
        btn.style.fontSize   = "12px";
        btn.style.cursor     = "pointer";

        btn.addEventListener("click", () => {
            const accountValue = getMailboxAccountValue();

            let commentText =
`Hello [Customer],

Changes requested are now applied to the account [ACCOUNT].`;

            if (accountValue) {
                commentText = commentText.replace("[ACCOUNT]", accountValue);
            } else {
                console.warn("[UserScript] No account value found, leaving [ACCOUNT] placeholder");
            }

            textarea.value = commentText;
            textarea.dispatchEvent(new Event("input",  { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            console.log("[UserScript] Special mailbox message inserted with account:", accountValue);
        });

        if (messageButton && messageButton.parentNode === container.parentNode) {
            messageButton.insertAdjacentElement("afterend", btn);
        } else {
            container.insertAdjacentElement("afterend", btn);
        }

        console.log("[UserScript] Special Mailbox Message button added");
    }

    // 5.3 Assign to me button
    function addAssignMeButton() {
        const recordType = getRecordType();
        if (!recordType) return;

        let assignedToDisplayId, assignedToHiddenId, groupDisplayId, groupHiddenId;

        if (recordType === "incident") {
            assignedToDisplayId = "sys_display.incident.assigned_to";
            assignedToHiddenId  = "incident.assigned_to";
            groupDisplayId      = "sys_display.incident.assignment_group";
            groupHiddenId       = "incident.assignment_group";
        } else if (recordType === "case") {
            assignedToDisplayId = "sys_display.sn_customerservice_case.assigned_to";
            assignedToHiddenId  = "sn_customerservice_case.assigned_to";
            groupDisplayId      = "sys_display.sn_customerservice_case.assignment_group";
            groupHiddenId       = "sn_customerservice_case.assignment_group";
        } else {
            return;
        }

        const assignedToDisplay = document.getElementById(assignedToDisplayId);
        if (!assignedToDisplay) return;
        if (document.getElementById(ASSIGN_ME_BUTTON_ID)) return;

        const container =
            assignedToDisplay.closest(".input-group.ref-container") ||
            assignedToDisplay.closest(".form-field");
        if (!container) {
            console.warn("[UserScript] Could not find container for Assigned to field");
            return;
        }

        const btn = document.createElement("button");
        btn.id   = ASSIGN_ME_BUTTON_ID;
        btn.type = "button";
        btn.textContent = "Assign to me";

        btn.style.marginTop  = "6px";
        btn.style.padding    = "6px 12px";
        btn.style.fontSize   = "12px";
        btn.style.cursor     = "pointer";
        btn.style.display    = "block";

        btn.addEventListener("click", () => {
            console.log("[UserScript] Assign to me clicked for", recordType);

            const currentUserName =
                (window.NOW && window.NOW.user_display_name) || "";
            if (!currentUserName) {
                console.warn("[UserScript] window.NOW.user_display_name is not available");
            }

            clearReference(groupDisplayId,groupHiddenId);
            clearReference(assignedToDisplayId,assignedToHiddenId);

            setReferenceField(
                groupDisplayId,
                "Service Desk",
                null,
                null
            );

            setTimeout(() => {
                if (!currentUserName) return;

                console.log("[UserScript] Setting Assigned to after delay for", recordType);

                setReferenceField(
                    assignedToDisplayId,
                    currentUserName,
                    null,
                    null
                );
            }, 1000);
        });

        container.insertAdjacentElement("afterend", btn);
        console.log("[UserScript] Assign to me button added for", recordType);
    }

    // 5.4 +3 days button near follow-up
    function addPlus3DaysButton() {
        let followUpElement = document.getElementById("element.incident.follow_up");
        let followUpInputId = "incident.follow_up";

        if (!followUpElement) {
            followUpElement = document.getElementById("element.sn_customerservice_case.follow_up");
            followUpInputId = "sn_customerservice_case.follow_up";
        }

        if (!followUpElement) return;

        const followUpInput = document.getElementById(followUpInputId);
        if (!followUpInput) return;

        if (document.getElementById(PLUS3_BUTTON_ID)) return;

        const addonsContainer = followUpElement.querySelector(".form-field-addons");
        if (!addonsContainer) {
            console.warn("[UserScript] Follow up addons container not found");
            return;
        }

        const btn = document.createElement("button");
        btn.id   = PLUS3_BUTTON_ID;
        btn.type = "button";
        btn.textContent = "+3 days";

        btn.style.marginLeft = "4px";
        btn.style.padding    = "4px 8px";
        btn.style.fontSize   = "11px";
        btn.style.cursor     = "pointer";

        btn.addEventListener("click", () => {
            setFollowUpDate(3);
        });

        addonsContainer.appendChild(btn);
        console.log("[UserScript] +3 days button added for follow up");
    }

    // -------------------------------------------------------------------------
    // 6. WATCHERS, OBSERVERS & STARTUP
    // -------------------------------------------------------------------------

    function initWatcher(textarea) {
        if (!textarea || textarea.dataset.snowWatcherAttached === "true") return;

        textarea.dataset.snowWatcherAttached = "true";
        console.log(`[UserScript] Watching #${textarea.id} for automatic replacements...`);

        const interval = setInterval(() => {
            if (!document.body.contains(textarea)) {
                clearInterval(interval);
                return;
            }
            doReplacement(textarea);
        }, 500);
    }

    // MutationObserver to catch dynamically added textareas and fields
    const observer = new MutationObserver(() => {
        TEXTBOX_IDS.forEach(id => {
            const textarea = document.getElementById(id);
            if (textarea) initWatcher(textarea);
        });
        addAssignMeButton();
        addPlus3DaysButton();
        addMailboxChangesButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Interval to bootstrap buttons once per form
    const interval = setInterval(() => {
        addMessageButton();
        addMailboxChangesButton();
        addAssignMeButton();
        addPlus3DaysButton();

        const recordType   = getRecordType();
        const hasMessage   = document.getElementById(MESSAGE_BUTTON);
        const hasAssignMe  = document.getElementById(ASSIGN_ME_BUTTON_ID);
        const hasPlus3     = document.getElementById(PLUS3_BUTTON_ID);
        const hasMailboxBtn = document.getElementById(MAILBOXCHANGES_MESSAGE_BUTTON_ID);

        if (recordType === "ritm") {
            if (hasMessage && hasAssignMe && hasPlus3 && hasMailboxBtn) {
                clearInterval(interval);
            }
        } else {
            if (hasMessage && hasAssignMe && hasPlus3) {
                clearInterval(interval);
            }
        }
    }, 500);

    // Initial pass to attach watchers to any existing textareas
    TEXTBOX_IDS.forEach(id => {
        const textarea = document.getElementById(id);
        if (textarea) initWatcher(textarea);
    });

})();
