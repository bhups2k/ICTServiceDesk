// ==UserScript==
// @name         ServiceNow Comments & Close Notes Auto-Replacer (multi-field, auto-run)
// @namespace    https://imperial.ac.uk/
// @version      1.5.9.15
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

    // Call-back button
    const CALLBACK_MESSAGE_BUTTON = "sn-auto-callback-btn";
    
    // In-person button
    const FIELDSUPPORT_MESSAGE_BUTTON = "sn-auto-fieldsupport-btn";

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
        "<Your Name>":      () => window.NOW?.user_display_name || "",
        "<your name>":      () => window.NOW?.user_display_name || "",
        "<name>":           () => window.NOW?.user_display_name || "",
        "<Name>":           () => window.NOW?.user_display_name || "",
    };

    // Extract common “customer” mappings
    function buildCustomerFields(selector) {
        return {
            "[Customer]": () => getFirstNameFromSelector(selector),
            "[customer]": () => getFirstNameFromSelector(selector),
            "<Customer>": () => getFirstNameFromSelector(selector),
            "<customer>": () => getFirstNameFromSelector(selector),
            "<user>"   : () => getFirstNameFromSelector(selector)
        };
    }

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

    function getFirstNameFromSelector(selector) {
        const el = document.querySelector(selector);
        if (!el || !el.value) return "";
        const parts = el.value.trim().split(/\s+/); // split on whitespace
        return parts[0] || "";
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

    function setWorkNotesText(text) {
        const workNotesTextarea = document.getElementById("activity-stream-work_notes-textarea");
        if (!workNotesTextarea) {
            console.warn("[UserScript] Work notes textarea #activity-stream-work_notes-textarea not found");
            return;
        }

        workNotesTextarea.value = text;
        workNotesTextarea.dispatchEvent(new Event("input",  { bubbles: true }));
        workNotesTextarea.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[UserScript] Work notes text inserted");
    }

    function uncheckNeedsAttentionCheckbox() {
        const needsAttentionField = document.getElementById("sn_customerservice_case.needs_attention");
        if (!needsAttentionField) {
            if (debug) console.log("[UserScript] needs_attention field not found on this page");
            return;
        }

        // Set value to "false" to uncheck
        needsAttentionField.value = "false";
        needsAttentionField.dispatchEvent(new Event("input",  { bubbles: true }));
        needsAttentionField.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[UserScript] needs_attention checkbox unchecked");
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

            uncheckNeedsAttentionCheckbox();

            console.log("[UserScript] Message inserted, state set to On Hold, hold reason Awaiting Caller");
        });

        container.insertAdjacentElement("afterend", btnMessage);
        console.log("[UserScript] Insert message button added");
    }
    // 5.2 Call-back button
    function addCallBackButton() {
        const textarea = document.getElementById(TEXTAREA_ID);
        if (!textarea) return;

        if (document.getElementById(CALLBACK_MESSAGE_BUTTON)) return;

        const container = textarea.closest(".sn-stream-textarea-container");
        if (!container) return;

        const messageButton = document.getElementById(MESSAGE_BUTTON);

        const btnCallBack = document.createElement("button");
        btnCallBack.id   = CALLBACK_MESSAGE_BUTTON;
        btnCallBack.type = "button";
        btnCallBack.textContent = "Call-back";

        btnCallBack.style.marginTop  = "6px";
        btnCallBack.style.marginLeft = "6px";
        btnCallBack.style.padding    = "6px 12px";
        btnCallBack.style.fontSize   = "12px";
        btnCallBack.style.cursor     = "pointer";

        btnCallBack.addEventListener("click", () => {
            const callbackText =
`Hello [Customer],

We think it's best try and support you over the phone for this ticket.
[code]You can contact the <a href="https://www.imperial.ac.uk/admin-services/ict/contact-ict-service-desk/"><b>Service Desk</b></a> on +44 (0)20 7594 9000 and quote your ticket number.[/code]
Alternatively, you can easily schedule your appointment by visiting our [code]<a href="https://outlook.office365.com/owa/calendar/ICT1stLineFieldSupportCopy@ImperialLondon.onmicrosoft.com/bookings/s/rqeaGFzyLkalumD2uU2z_w2"><b>Booking</b></a>[/code] page.

Your Ticket Number is: [code]<b>REPLACEMEWITHTICKETNUMBER</b>[/code]

Please make sure to enter your ticket number in the designated field on the booking page. It's essential to do so, as failing to provide a valid ticket number will unfortunately lead to an automatic cancellation of your booking.

Or you can get [code]<b>in-person support</b>[/code] by visiting us [code]<b>Monday-Friday</b>[/code] at:
[code]<ul>
    <li>South Kensington
        <ul>
            <li>Level 1, Abdus Salam Library, 08.30-17.30</li>
        </ul>
    </li>
    <li>White City
        <ul>
            <li>Student Hub, Michael Uren Building, 09.00-16.30</li>
            <li>Level 1, The MediaWorks, 09.00-17.00 (Only for colleagues working there)</li>
        </ul>
    </li>
    <li>Silwood Park
        <ul>
            <li>Hamilton Building, Main Entrance, 12.30-13.30</li>
        </ul>
    </li>
    <li>Hammersmith
        <ul>
            <li>Library, Commonwealth Building, 09.00-16.30 (Mondays and Thursdays)</li>
        </ul>
    </li>
</ul>[/code]
(We are closed on university closure days.)

Kind regards,
[Your Full Name]
1st Line Support Team`;

            textarea.value = callbackText;
            textarea.dispatchEvent(new Event("input",  { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            setSelectByLabel("incident.state",       "On Hold");
            setSelectByLabel("incident.hold_reason", "Awaiting Caller");
            setFollowUpDate(3);

            setWorkNotesText(`MSBookings: True
IMPORTANT: Please provide the reason for offering a call-back:`);

            uncheckNeedsAttentionCheckbox();

            console.log("[UserScript] Call-back message inserted, state set to On Hold, hold reason Awaiting Caller");
        });

        if (messageButton && messageButton.parentNode === container.parentNode) {
            messageButton.insertAdjacentElement("afterend", btnCallBack);
        } else {
            container.insertAdjacentElement("afterend", btnCallBack);
        }

        console.log("[UserScript] Insert call-back button added");
    }
    // 5.2 Field Support button
    function addFieldSupportButton() {
        const textarea = document.getElementById(TEXTAREA_ID);
        if (!textarea) return;

        if (document.getElementById(FIELDSUPPORT_MESSAGE_BUTTON)) return;

        const container = textarea.closest(".sn-stream-textarea-container");
        if (!container) return;

        const messageButton = document.getElementById(MESSAGE_BUTTON);

        const btnFieldSupport = document.createElement("button");
        btnFieldSupport.id   = FIELDSUPPORT_MESSAGE_BUTTON;
        btnFieldSupport.type = "button";
        btnFieldSupport.textContent = "Field Support";

        btnFieldSupport.style.marginTop  = "6px";
        btnFieldSupport.style.marginLeft = "6px";
        btnFieldSupport.style.padding    = "6px 12px";
        btnFieldSupport.style.fontSize   = "12px";
        btnFieldSupport.style.cursor     = "pointer";

        btnFieldSupport.addEventListener("click", () => {
            const callbackText =
`Hello [Customer],

Your ticket will require a field visit, with you present, to resolve/complete. You can schedule your appointment by visiting our [code]<a href="https://outlook.office365.com/owa/calendar/ICT1stLineFieldSupportCopy@ImperialLondon.onmicrosoft.com/bookings/?skipRedirect=1"><b>Booking</b></a>[/code] page.

Your Ticket Number is: [code]<b>REPLACEMEWITHTICKETNUMBER</b>[/code]

Please make sure to enter your ticket number in the designated field on the booking page. It's essential to do so, as failing to provide a valid ticket number will unfortunately lead to an automatic cancellation of your booking.

[code]<b>A known issue in MS Bookings may cause the error message, "Something Went Wrong. We couldn't book that appointment. Please reload the page and try again" If this happens, please wait 5 minutes and try again. </b>[/code]

Or you can get [code]<b>in-person support</b>[/code] by visiting us [code]<b>Monday-Friday</b>[/code] at:
[code]<ul>
    <li>South Kensington
        <ul>
            <li>Level 1, Abdus Salam Library, 08.30-17.30</li>
        </ul>
    </li>
    <li>White City
        <ul>
            <li>Student Hub, Michael Uren Building, 09.00-16.30</li>
            <li>Level 1, The MediaWorks, 09.00-17.00 (Only for colleagues working there)</li>
        </ul>
    </li>
    <li>Silwood Park
        <ul>
            <li>Hamilton Building, Main Entrance, 12.30-13.30</li>
        </ul>
    </li>
    <li>Hammersmith
        <ul>
            <li>Library, Commonwealth Building, 09.00-16.30 (Mondays and Thursdays)</li>
        </ul>
    </li>
</ul>[/code]
(We are closed on university closure days.)

Kind regards,
[Your Full Name]
1st Line Support Team`;

            textarea.value = callbackText;
            textarea.dispatchEvent(new Event("input",  { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            setSelectByLabel("incident.state",       "On Hold");
            setSelectByLabel("incident.hold_reason", "Awaiting Caller");
            setFollowUpDate(3);

            setWorkNotesText(`MSBookings: True
IMPORTANT: Please provide the reason for offering a field visit:`);

            uncheckNeedsAttentionCheckbox();

            console.log("[UserScript] Call-back message inserted, state set to On Hold, hold reason Awaiting Caller");
        });

        if (messageButton && messageButton.parentNode === container.parentNode) {
            messageButton.insertAdjacentElement("afterend", btnFieldSupport);
        } else {
            container.insertAdjacentElement("afterend", btnFieldSupport);
        }

        console.log("[UserScript] Insert field support button added");
    }
    // 5.2 Chase 1 button (simple chase message, same actions as Message)
    function addChase1Button() {
        const textarea = document.getElementById(TEXTAREA_ID);
        if (!textarea) return;

        const CHASE1_BUTTON_ID = "sn-chase1-btn";

        // Avoid duplicates
        if (document.getElementById(CHASE1_BUTTON_ID)) return;

        const container = textarea.closest(".sn-stream-textarea-container");
        if (!container) return;

        const messageButton = document.getElementById(MESSAGE_BUTTON);

        const btnChase = document.createElement("button");
        btnChase.id = CHASE1_BUTTON_ID;
        btnChase.type = "button";
        btnChase.textContent = "Chase 1";

        btnChase.style.marginTop = "6px";
        btnChase.style.marginLeft = "6px";      // to the right of Message
        btnChase.style.padding = "6px 12px";
        btnChase.style.fontSize = "12px";
        btnChase.style.cursor = "pointer";

        btnChase.addEventListener("click", () => {
            const chaseText =
                  `Hello [Customer],

We would like to follow up on our previous email regarding this ticket as we have not received a response from you yet. If you still require assistance, please let us know, and we will be happy to help.

Kind regards,
[Your Full Name]
1st Line Support Team`;

            // 1️⃣ Set the chase message
            textarea.value = chaseText;
            textarea.dispatchEvent(new Event("input",  { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            // 2️⃣ Same actions as Message button
            //    Set state = "On Hold"
            setSelectByLabel("incident.state", "On Hold");

            //    Set hold reason = "Awaiting Caller"
            setSelectByLabel("incident.hold_reason", "Awaiting Caller");

            //    Set follow-up date = today + 3 working days at 10:00
            setFollowUpDate(3);

            uncheckNeedsAttentionCheckbox();

            console.log("[UserScript] Chase 1 message inserted, state set to On Hold, hold reason Awaiting Caller");
        });

        if (messageButton && messageButton.parentNode === container.parentNode) {
            // Insert Chase 1 immediately after the Message button
            messageButton.insertAdjacentElement("afterend", btnChase);
        } else {
            container.insertAdjacentElement("afterend", btnChase);
        }
    }
    // 5.3 Mailbox changes button (RITM special case)
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

Changes requested are now applied to the account [ACCOUNT].
Please allow a few hours for the changes to take effect.

Kind regards,
[Your Full Name]
1st Line Support Team`;

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

    // 5.4 Assign to me button
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

    // 5.5 +3 days button near follow-up
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

    // 5.6 Close Notes
    function addCloseNotesButton(textareaId, buttonId, label, onClick) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;

        // Avoid duplicates
        if (document.getElementById(buttonId)) return;

        // Try to find a sensible container (similar to your other buttons)
        // For standard form layout, the textarea sits inside a.form-group.form-field
        const container =
              textarea.closest(".form-field") ||
              textarea.parentElement; // fallback

        if (!container) {
            console.warn(`[UserScript] Could not find container for #${textareaId}`);
            return;
        }

        const btn = document.createElement("button");
        btn.id = buttonId;
        btn.type = "button";
        btn.textContent = label;

        btn.style.marginTop = "6px";
        btn.style.padding = "6px 12px";
        btn.style.fontSize = "12px";
        btn.style.cursor = "pointer";
        btn.style.display = "block";

        btn.addEventListener("click", () => onClick(textarea));

        // Find all existing close-notes buttons under this textarea
        const existingButtons = container.querySelectorAll(
            'button[id^="sn-close-notes-"]'
        );

        if (existingButtons.length > 0) {
            // Insert after the last existing button
            existingButtons[existingButtons.length - 1].insertAdjacentElement("afterend", btn);
        } else {
            // First button: place after the textarea
            textarea.insertAdjacentElement("afterend", btn);
        }

        console.log(`[UserScript] Close notes button "${label}" added for #${textareaId}`);
    }

    function addIncidentCloseNotesButton() {
        addCloseNotesButton(
            "incident.close_notes",
            "sn-close-notes-incident-btn",
            "Close notes",
            (textarea) => {
                const template =
                      `Hello [Customer],

Thank you for reaching out to the ICT Service Desk.

If there is any other assistance you require, please do not hesitate to let us know. We are happy to help. Otherwise, no further action is necessary, and the ticket will automatically close after 7 days.

Kind regards,
[Your Full Name]
1st Line Support Team`;

                textarea.value = template;

                textarea.dispatchEvent(new Event("input",  { bubbles: true }));
                textarea.dispatchEvent(new Event("change", { bubbles: true }));

                console.log("[UserScript] Incident close notes template inserted");
            }
        );
    }

    function addCaseCloseNotesButton() {
        addCloseNotesButton(
            "sn_customerservice_case.close_notes",
            "sn-close-notes-case-btn",
            "Close notes",
            (textarea) => {
                const template =
                      `Hello [Customer],

Thank you for reaching out to the ICT Service Desk.

If there is any other assistance you require, please do not hesitate to let us know. We are happy to help. Otherwise, no further action is necessary, and the ticket will automatically close after 7 days.

Kind regards,
[Your Full Name]
1st Line Support Team`;

                textarea.value = template;

                textarea.dispatchEvent(new Event("input",  { bubbles: true }));
                textarea.dispatchEvent(new Event("change", { bubbles: true }));

                console.log("[UserScript] Case close notes template inserted");
            }
        );
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
        addMessageButton();
        addCallBackButton();
        addFieldSupportButton();
        addChase1Button();
        addMailboxChangesButton();
        addAssignMeButton();
        addPlus3DaysButton();
        addIncidentCloseNotesButton();
        addCaseCloseNotesButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Interval to bootstrap buttons once per form
    const interval = setInterval(() => {
        addMessageButton();
        addCallBackButton();
        addFieldSupportButton();
        addChase1Button();
        addMailboxChangesButton();
        addAssignMeButton();
        addPlus3DaysButton();
        addIncidentCloseNotesButton();
        addCaseCloseNotesButton();

        const recordType   = getRecordType();
        const hasMessage   = document.getElementById(MESSAGE_BUTTON);
        const hasCallBack  = document.getElementById(CALLBACK_MESSAGE_BUTTON);
        const hasFieldSupport  = document.getElementById(FIELDSUPPORT_MESSAGE_BUTTON);
        const hasAssignMe  = document.getElementById(ASSIGN_ME_BUTTON_ID);
        const hasPlus3     = document.getElementById(PLUS3_BUTTON_ID);
        const hasMailboxBtn = document.getElementById(MAILBOXCHANGES_MESSAGE_BUTTON_ID);

        if (recordType === "ritm") {
            if (hasMessage && hasCallBack && hasFieldSupport && hasAssignMe && hasPlus3 && hasMailboxBtn) {
                clearInterval(interval);
            }
        } else {
            if (hasMessage && hasCallBack && hasFieldSupport && hasAssignMe && hasPlus3) {
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
