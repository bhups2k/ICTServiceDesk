// ==UserScript==
// @name         ServiceNow - Rich Text Toolbar for Additional Comments
// @namespace    https://imperial.ac.uk/
// @version      6.2
// @description  WYSIWYG rich text editor - Rich Text + combined Source & Code tab
// @author       Bhups Patel
// @match        https://servicemgt.imperial.ac.uk/*
// @match        https://servicemgt.service-now.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://github.com/bhups2k/ICTServiceDesk/raw/refs/heads/main/ServiceNow-RichTextComments.user.js
// @downloadURL  https://github.com/bhups2k/ICTServiceDesk/raw/refs/heads/main/ServiceNow-RichTextComments.user.js
// ==/UserScript==

const debug = false;

(function () {
    'use strict';

    console.log('[SN RICH TEXT] Script started.');

    // =============================================
    // CONVERT contenteditable innerHTML → SN format
    // =============================================
    function htmlToSNFormat(html) {
        html = html.replace(/(<br\s*\/?>)+$/gi, '').trim();
        return html ? '[code]' + html + '[/code]' : '';
    }

    // =============================================
    // CONVERT raw source (with [code] tags) → HTML
    // Used when Auto-Replacer scripts write content
    // =============================================
    function sourceToHTML(text) {
        // Step 1: Process [code]...[/code] blocks first
        // Strip ALL newlines and excess whitespace from inside them
        var result = text.replace(
            /\[code\]([\s\S]*?)\[\/code\]/gi,
            function (_, inner) {
                return inner.replace(/\r?\n/g, '')     // remove ALL newlines.replace(/\s{2,}/g, ' ')   // collapse multiple spaces to one.replace(/>\s+</g, '><')   // remove whitespace between tags.trim();
            }
        );

        // Step 2: Convert remaining plain-text newlines to <br>
        result = result.replace(/\r?\n/g, '<br>');

        return result;
    }

    // =============================================
    // TOOLBAR COMMANDS
    // =============================================
    var toolbarButtons = [
        {
            label: 'B', title: 'Bold',
            style: 'font-weight:bold;',
            action: function () { document.execCommand('bold', false, null); }
        },
        {
            label: 'I', title: 'Italic',
            style: 'font-style:italic;',
            action: function () { document.execCommand('italic', false, null); }
        },
        {
            label: 'U', title: 'Underline',
            style: 'text-decoration:underline;',
            action: function () { document.execCommand('underline', false, null); }
        },
        {
            label: 'S', title: 'Strikethrough',
            style: 'text-decoration:line-through;',
            action: function () { document.execCommand('strikeThrough', false, null); }
        },
        { label: '|', title: '', style: 'cursor:default;opacity:0.3;', action: null },
        {
            label: '≡L', title: 'Align Left',
            style: '',
            action: function () { document.execCommand('justifyLeft', false, null); }
        },
        {
            label: '≡C', title: 'Align Centre',
            style: '',
            action: function () { document.execCommand('justifyCenter', false, null); }
        },
        {
            label: '≡R', title: 'Align Right',
            style: '',
            action: function () { document.execCommand('justifyRight', false, null); }
        },
        { label: '|', title: '', style: 'cursor:default;opacity:0.3;', action: null },
        {
            label: '•', title: 'Bullet List',
            style: '',
            action: function () { document.execCommand('insertUnorderedList', false, null); }
        },
        {
            label: '1.', title: 'Numbered List',
            style: '',
            action: function () { document.execCommand('insertOrderedList', false, null); }
        },
        { label: '|', title: '', style: 'cursor:default;opacity:0.3;', action: null },
        {
            label: '🔗', title: 'Insert Link',
            style: '',
            action: function (editor) {
                var url = prompt('Enter URL:', 'https://');
                if (url) {
                    document.execCommand('createLink', false, url);
                    var links = editor.querySelectorAll('a:not([target])');
                    links.forEach(function (a) { a.target = '_blank'; });
                }
            }
        },
        {
            label: 'A', title: 'Text Colour',
            style: 'color:red;font-weight:bold;',
            action: function () {
                var colour = prompt('Enter colour (e.g. red, #ff0000):', '#000000');
                if (colour) document.execCommand('foreColor', false, colour);
            }
        },
        { label: '|', title: '', style: 'cursor:default;opacity:0.3;', action: null },
        {
            label: 'H1', title: 'Heading 1',
            style: 'font-weight:bold;',
            action: function () { document.execCommand('formatBlock', false, 'H1'); }
        },
        {
            label: 'H2', title: 'Heading 2',
            style: 'font-weight:bold;',
            action: function () { document.execCommand('formatBlock', false, 'H2'); }
        },
        {
            label: 'P', title: 'Paragraph',
            style: '',
            action: function () { document.execCommand('formatBlock', false, 'P'); }
        },
        { label: '|', title: '', style: 'cursor:default;opacity:0.3;', action: null },
        {
            label: '↺', title: 'Undo',
            style: '',
            action: function () { document.execCommand('undo', false, null); }
        },
        {
            label: '↻', title: 'Redo',
            style: '',
            action: function () { document.execCommand('redo', false, null); }
        },
    ];

    // =============================================
    // FIND THE COMMENTS FIELD
    // =============================================
    function findCommentsField() {
        var selectors = [
            '#activity-stream-comments-textarea',
            'textarea[id*="comments"]',
            'textarea[aria-label*="Additional comments"]',
            'textarea[placeholder*="Additional comments"]',
            '#comments'
        ];

        var docs = [document];
        try {
            document.querySelectorAll('iframe').forEach(function (f) {
                try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {}
            });
        } catch (e) {}

        for (var d = 0; d < docs.length; d++) {
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var el = docs[d].querySelector(selectors[s]);
                    if (el) return { el: el, doc: docs[d] };
                } catch (e) {}
            }
        }
        return null;
    }

    // =============================================
    // HELPERS
    // =============================================
    function btnBase() {
        return [
            'background:transparent',
            'color:inherit',
            'border:1px solid #aaa',
            'border-radius:4px',
            'padding:3px 8px',
            'cursor:pointer',
            'font-size:12px',
            'min-width:28px',
            'text-align:center',
            'line-height:1.4',
            'margin:1px'
        ].join(';') + ';';
    }

    function makeTab(doc, label, active) {
        var t = doc.createElement('div');
        t.innerText = label;
        t.style.cssText = [
            'padding:5px 16px',
            'cursor:pointer',
            'font-size:12px',
            'border-right:1px solid #ccc',
            'user-select:none',
            'color:inherit',
            'background:' + (active ? 'rgba(0,0,0,0.08)' : 'transparent'),
            'font-weight:'  + (active ? 'bold' : 'normal')
        ].join(';');
        return t;
    }

    function setActiveTab(on, off) {
        on.style.background  = 'rgba(0,0,0,0.08)';
        on.style.fontWeight  = 'bold';
        off.style.background = 'transparent';
        off.style.fontWeight = 'normal';
    }

    // =============================================
    // BUILD & INJECT THE TOOLBAR UI
    // =============================================
    function inject(fieldEl, doc) {
        if (doc.getElementById('snRT_container')) return;

        // ── Outer container ──────────────────────
        var container = doc.createElement('div');
        container.id = 'snRT_container';
        container.style.cssText = [
            'border:1px solid #ccc',
            'border-radius:6px',
            'overflow:hidden',
            'font-family:inherit',
            'font-size:13px',
            'margin-bottom:6px'
        ].join(';');

        // ── Toolbar row ──────────────────────────
        var toolbar = doc.createElement('div');
        toolbar.style.cssText = [
            'display:flex',
            'flex-wrap:wrap',
            'align-items:center',
            'padding:4px 6px',
            'border-bottom:1px solid #ccc',
            'background:rgba(0,0,0,0.04)',
            'gap:2px'
        ].join(';');

        // MENU button
        var menuBtn = doc.createElement('button');
        menuBtn.type = 'button';
        menuBtn.innerHTML = '&#9776;';
        menuBtn.title = 'Toggle Editor';
        menuBtn.style.cssText = btnBase() +
            'font-weight:bold;padding:4px 8px;margin-right:4px;';
        toolbar.appendChild(menuBtn);

        var richEditor; // forward ref

        toolbarButtons.forEach(function (btn) {
            if (btn.label === '|') {
                var s = doc.createElement('span');
                s.style.cssText =
                    'width:1px;height:20px;background:#ccc;margin:0 3px;display:inline-block;';
                toolbar.appendChild(s);
                return;
            }
            var b = doc.createElement('button');
            b.type = 'button';
            b.innerText = btn.label;
            b.title = btn.title;
            b.style.cssText = btnBase() + btn.style;
            b.addEventListener('mousedown', function (e) {
                e.preventDefault(); // prevent editor losing focus
                if (btn.action) {
                    // Switch to rich text tab if not already there
                    if (activePane !== 'richtext') {
                        showRichText();
                    }
                    richEditor.focus();
                    btn.action(richEditor);
                    syncToOriginal();
                    if (combinedPane.style.display !== 'none') updateCombinedPane();
                }
            });
            toolbar.appendChild(b);
        });

        container.appendChild(toolbar);

        // ── Tab bar (2 tabs only) ─────────────────
        var tabBar = doc.createElement('div');
        tabBar.style.cssText = [
            'display:flex',
            'border-bottom:1px solid #ccc',
            'background:rgba(0,0,0,0.02)'
        ].join(';');

        var richTextTab   = makeTab(doc, '✦ Rich Text',      true);
        var combinedTab   = makeTab(doc, '⟨/⟩ Source & Code', false);

        tabBar.appendChild(richTextTab);
        tabBar.appendChild(combinedTab);
        container.appendChild(tabBar);

        // ── Rich Text pane (contenteditable WYSIWYG) ──
        richEditor = doc.createElement('div');
        richEditor.id = 'snRT_richtext';
        richEditor.contentEditable = 'true';
        richEditor.setAttribute('data-placeholder',
            'Type your message here. Use the toolbar above to format...');
        richEditor.style.cssText = [
            'display:block',
            'min-height:120px',
            'max-height:400px',
            'overflow-y:auto',
            'font-family:inherit',
            'font-size:13px',
            'padding:10px',
            'box-sizing:border-box',
            'word-wrap:break-word',
            'background:transparent',
            'color:inherit',
            'line-height:1.6',
            'outline:none'
        ].join(';');

        // Placeholder via CSS
        var style = doc.createElement('style');
        style.textContent =
            '#snRT_richtext:empty:before {' +
            '  content: attr(data-placeholder);' +
            '  opacity: 0.4;' +
            '  pointer-events: none;' +
            '  display: block;' +
            '}';
        doc.head.appendChild(style);

        // ── Handle Enter key explicitly ──────────────
        // contenteditable in ServiceNow's DOM can have
        // Enter swallowed by parent listeners.
        // We force a <br> insertion on Enter ourselves.
        richEditor.addEventListener('keydown', function (e) {

            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation(); // stop SN swallowing it

                var sel = window.getSelection();
                if (!sel || !sel.rangeCount) return;

                var range = sel.getRangeAt(0);
                range.deleteContents();

                // Insert a <br> at cursor position
                var br = doc.createElement('br');
                range.insertNode(br);

                // Move cursor after the <br>
                range = doc.createRange();
                range.setStartAfter(br);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);

                // If at end of content, add a second <br>
                // so cursor is visibly on the new line
                var next = br.nextSibling;
                if (!next || (next.nodeType === 3 && next.nodeValue === '')) {
                    var br2 = doc.createElement('br');
                    br.parentNode.insertBefore(br2, br.nextSibling);
                }

                syncToOriginal();
                if (combinedPane.style.display !== 'none') updateCombinedPane();
            }

            // Ctrl+B / Ctrl+I / Ctrl+U shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        document.execCommand('bold', false, null);
                        syncToOriginal();
                        break;
                    case 'i':
                        e.preventDefault();
                        document.execCommand('italic', false, null);
                        syncToOriginal();
                        break;
                    case 'u':
                        e.preventDefault();
                        document.execCommand('underline', false, null);
                        syncToOriginal();
                        break;
                    case 'z':
                        e.preventDefault();
                        document.execCommand('undo', false, null);
                        syncToOriginal();
                        break;
                    case 'y':
                        e.preventDefault();
                        document.execCommand('redo', false, null);
                        syncToOriginal();
                        break;
                }
            }
        });

        container.appendChild(richEditor);

        // ── Combined Source & Code pane ───────────
        // Top half: editable HTML source
        // Bottom half: read-only [code]...[/code] output
        var combinedPane = doc.createElement('div');
        combinedPane.id = 'snRT_combined';
        combinedPane.style.cssText = [
            'display:none',
            'font-family:monospace',
            'font-size:12px'
        ].join(';');

        // Source section label
        var sourceLabel = doc.createElement('div');
        sourceLabel.style.cssText = [
            'padding:4px 10px',
            'font-size:11px',
            'font-weight:bold',
            'border-bottom:1px solid #ccc',
            'background:rgba(0,0,0,0.04)',
            'opacity:0.7'
        ].join(';');
        sourceLabel.innerText = '✎ HTML Source  (editable — changes update Rich Text)';
        combinedPane.appendChild(sourceLabel);

        // Source textarea (editable)
        var sourceArea = doc.createElement('textarea');
        sourceArea.id = 'snRT_source';
        sourceArea.placeholder = 'HTML source...';
        sourceArea.style.cssText = [
            'width:100%',
            'min-height:120px',
            'max-height:200px',
            'font-family:monospace',
            'font-size:12px',
            'padding:10px',
            'border:none',
            'border-bottom:2px solid #ccc',
            'outline:none',
            'resize:vertical',
            'box-sizing:border-box',
            'background:transparent',
            'color:inherit'
        ].join(';');
        combinedPane.appendChild(sourceArea);

        // Code output section label
        var codeLabel = doc.createElement('div');
        codeLabel.style.cssText = [
            'padding:4px 10px',
            'font-size:11px',
            'font-weight:bold',
            'border-bottom:1px solid #ccc',
            'background:rgba(0,0,0,0.04)',
            'opacity:0.7'
        ].join(';');
        codeLabel.innerText = '⟨/⟩ Final Code Output  (read-only — exactly what gets posted)';
        combinedPane.appendChild(codeLabel);

        // Code output pre (read-only)
        var codeOutput = doc.createElement('pre');
        codeOutput.id = 'snRT_codeoutput';
        codeOutput.style.cssText = [
            'min-height:60px',
            'max-height:150px',
            'overflow-y:auto',
            'font-family:monospace',
            'font-size:12px',
            'padding:10px',
            'margin:0',
            'box-sizing:border-box',
            'word-wrap:break-word',
            'white-space:pre-wrap',
            'background:rgba(0,0,0,0.03)',
            'color:inherit',
            'border:none',
            'user-select:all'
        ].join(';');
        combinedPane.appendChild(codeOutput);

        container.appendChild(combinedPane);

        // ── Status bar ───────────────────────────
        var statusBar = doc.createElement('div');
        statusBar.style.cssText = [
            'font-size:11px',
            'padding:3px 10px',
            'border-top:1px solid #ccc',
            'font-family:monospace',
            'opacity:0.5'
        ].join(';');
        statusBar.innerText = 'Viewing: Rich Text (WYSIWYG)  |  Posts as: [code]<html>[/code]';
        container.appendChild(statusBar);

        // ── Hide original & insert container ─────
        fieldEl.style.display = 'none';
        fieldEl.parentNode.insertBefore(container, fieldEl);

        // =============================================
        // CORE FUNCTIONS
        // =============================================

        var activePane = 'richtext';

        function syncToOriginal() {
            var html = richEditor.innerHTML;
            if (!html || html === '<br>') {
                fieldEl.value = '';
            } else {
                fieldEl.value = htmlToSNFormat(html);
            }
            fieldEl.dispatchEvent(new Event('change', { bubbles: true }));
            fieldEl.dispatchEvent(new Event('input',  { bubbles: true }));
        }

        function updateCombinedPane() {
            // Source area = raw innerHTML
            sourceArea.value = richEditor.innerHTML;
            // Code output = final [code]...[/code] string
            var html = richEditor.innerHTML;
            codeOutput.innerText = html && html !== '<br>'
                ? htmlToSNFormat(html)
                : '(empty)';
        }

        function applySourceToRich() {
            richEditor.innerHTML = sourceArea.value;
            syncToOriginal();
            // Update code output live as source is edited
            var html = richEditor.innerHTML;
            codeOutput.innerText = html && html !== '<br>'
                ? htmlToSNFormat(html)
                : '(empty)';
        }

        // ── Show helpers ─────────────────────────
        function showRichText() {
            // Apply any source edits before switching
            if (activePane === 'combined') applySourceToRich();
            richEditor.style.display    = 'block';
            combinedPane.style.display  = 'none';
            setActiveTab(richTextTab, combinedTab);
            activePane = 'richtext';
            statusBar.innerText = 'Viewing: Rich Text (WYSIWYG)  |  Posts as: [code]<html>[/code]';
            richEditor.focus();
        }

        function showCombined() {
            updateCombinedPane();
            richEditor.style.display    = 'none';
            combinedPane.style.display  = 'block';
            setActiveTab(combinedTab, richTextTab);
            activePane = 'combined';
            statusBar.innerText = 'Viewing: Source & Code  |  Posts as: [code]<html>[/code]';
        }

        // ── Rich editor live sync ────────────────
        richEditor.addEventListener('input', function () {
            syncToOriginal();
            if (combinedPane.style.display !== 'none') updateCombinedPane();
        });

        // ── Source area live sync → rich + code ──
        sourceArea.addEventListener('input', function () {
            applySourceToRich();
        });

        // ── Paste handling ───────────────────────
        richEditor.addEventListener('paste', function (e) {
            e.preventDefault();
            if (e.clipboardData) {
                var html = e.clipboardData.getData('text/html');
                if (html) {
                    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/\s*class="[^"]*"/gi, '').replace(/\s*style="[^"]*"/gi, '').replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, '').replace(/<\/?(html|head|body|meta|link|xml)[^>]*>/gi, '').trim();
                    document.execCommand('insertHTML', false, html);
                } else {
                    var text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                }
            }
            syncToOriginal();
        });

        // ── Tab switching ────────────────────────
        richTextTab.addEventListener('click', showRichText);
        combinedTab.addEventListener('click', showCombined);

        // ── MENU toggle ──────────────────────────
        var expanded = true;

        menuBtn.addEventListener('click', function () {
            expanded = !expanded;
            tabBar.style.display    = expanded ? 'flex'  : 'none';
            statusBar.style.display = expanded ? 'block' : 'none';

            if (expanded) {
                richEditor.style.display   = activePane === 'richtext'  ? 'block' : 'none';
                combinedPane.style.display = activePane === 'combined'  ? 'block' : 'none';
            } else {
                richEditor.style.display   = 'none';
                combinedPane.style.display = 'none';
            }
        });

        // ── Hook Post button ─────────────────────
        function hookPost() {
            [
                'button[id*="post"]',
                '.btn-post',
                'button[name="post"]',
                '#activity-submit-button',
                'button[aria-label*="Post"]'
            ].forEach(function (sel) {
                try {
                    var btn = doc.querySelector(sel);
                    if (btn && !btn._snRTv6) {
                        btn._snRTv6 = true;
                        btn.addEventListener('click', syncToOriginal);
                    }
                } catch (e) {}
            });
        }

        hookPost();
        new MutationObserver(hookPost).observe(doc.body, { childList: true, subtree: true });

        // =============================================
        // ✅ BRIDGE: Mirror external script writes
        // =============================================
        var lastBridgedValue = '';

        setInterval(function () {
            var currentOriginal = fieldEl.value;

            if (currentOriginal === lastBridgedValue) return;
            if (currentOriginal === htmlToSNFormat(richEditor.innerHTML)) return;

            if (currentOriginal !== '') {
                var rendered = sourceToHTML(currentOriginal);
                richEditor.innerHTML = rendered;
                lastBridgedValue     = currentOriginal;

                showRichText();

                syncToOriginal();
                lastBridgedValue = fieldEl.value;

                console.log('[SN RICH TEXT v6.1] ✅ Bridged & rendered external content.');

            } else {
                richEditor.innerHTML  = '';
                lastBridgedValue      = '';
                sourceArea.value      = '';
                codeOutput.innerText  = '';
                console.log('[SN RICH TEXT v6.1] Editor cleared after post.');
            }

        }, 300);

        console.log('[SN RICH TEXT v6.1] ✅ Injected with combined Source & Code tab!');
    }

    // =============================================
    // POLLING
    // =============================================
    var attempts = 0;

    function tryInject() {
        attempts++;
        var result = findCommentsField();
        if (result) {
            inject(result.el, result.doc);
        } else if (attempts < 30) {
            setTimeout(tryInject, 1000);
        } else {
            console.warn('[SN RICH TEXT v6.1] ❌ Field not found after 30 attempts.');
        }
    }

    setTimeout(tryInject, 500);

})();