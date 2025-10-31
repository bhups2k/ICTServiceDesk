// ==UserScript==
// @name         Not so readonly MAC address on HDB
// @namespace    https://www.imperial.ac.uk/
// @version      0.1
// @description  Allows you to change the MAC address field by disabling the readOnly field.
// @author       Bhups
// @match        https://hdb.ic.ac.uk/Zope/HDB/showmachine_html/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    var macTextBoxs = document.getElementsByName('interfaces.newmac:records'), i;
    for (i = 0; i < macTextBoxs.length; i++) {
        document.getElementsByName('interfaces.newmac:records')[i].readOnly=false;
    }

})();
