var debugMode = false;

var url, tab, currentDomain;
var trackedProfileName = null;
var origProfileTable = "";
var liveCookies = [];
var editorMode = 'cookies';
var liveStorage = [];
var editorVisible = false;
var popupShell = null;
var transferMode = null;
var transferHideTimer = null;
var copyToastTimer = null;

function debugLog(logData) {
	if (debugMode == true) {
		console.log(logData);
	}
}

function setStatus(message) {
	$('#status_message').text(message);
}

function setEditorCookieCount(count) {
	$('#editor_cookie_count').text(count);
}

function showCopyToast(label) {
	if (copyToastTimer) {
		window.clearTimeout(copyToastTimer);
	}
	$('#copyToast').text(label || 'Copied').addClass('is-visible').attr('aria-hidden', 'false');
	copyToastTimer = window.setTimeout(function() {
		$('#copyToast').removeClass('is-visible').attr('aria-hidden', 'true');
	}, 1200);
}

function copyToClipboard(text, successMessage) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(text).then(function() {
			setStatus(successMessage);
		}, function() {
			setStatus('Copy failed');
		});
	}

	var tempTextarea = document.createElement('textarea');
	tempTextarea.value = text;
	document.body.appendChild(tempTextarea);
	tempTextarea.select();
	document.execCommand('copy');
	document.body.removeChild(tempTextarea);
	setStatus(successMessage);
	return null;
}

function getHostName(url) {
	var match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
	if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
		debugLog(match[2]);
		return match[2];
	}
	return null;
}

var GENERIC_SECOND_LEVEL_LABELS = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'mil', 'sch', 'biz', 'info'];

function getDomain(url) {
	var hostName = getHostName(url);
	var domain = url;

	if (hostName != null) {
		var parts = hostName.split('.').reverse();

		if (parts != null && parts.length > 1) {
			domain = parts[1] + '.' + parts[0];

			var isTwoLetterCountryCode = /^[a-z]{2}$/i.test(parts[0]);
			var isGenericSecondLevelLabel = GENERIC_SECOND_LEVEL_LABELS.indexOf(parts[1].toLowerCase()) !== -1;
			if (isTwoLetterCountryCode && isGenericSecondLevelLabel && parts.length > 2) {
				domain = parts[2] + '.' + domain;
			}
		}
	}
	debugLog(domain);
	return domain;
}

function getDefaultDomainProfile() {
	return {
		currentProfile: "Profile 1",
		profileData: {
			"Profile 1": []
		}
	};
}

function getDomainProfile(items) {
	if (jQuery.isEmptyObject(items) || jQuery.isEmptyObject(items.profiles) || jQuery.isEmptyObject(items.profiles[currentDomain])) {
		return getDefaultDomainProfile();
	}
	return JSON.parse(JSON.stringify(items.profiles[currentDomain]));
}

function getProfileStore(items) {
	return jQuery.isEmptyObject(items) || jQuery.isEmptyObject(items.profiles) ? {} : JSON.parse(JSON.stringify(items.profiles));
}

function cloneCookie(cookie) {
	return JSON.parse(JSON.stringify(cookie));
}

function normalizeCookieArray(cookieData) {
	if (Array.isArray(cookieData)) {
		return cookieData;
	}
	return [];
}

function extrapolateUrlFromCookie(cookie) {
	var prefix = cookie.secure ? "https://" : "http://";
	if (cookie.domain.charAt(0) == ".") {
		prefix += "www";
	}

	return prefix + cookie.domain + cookie.path;
}

function sanitizeCookieForSet(cookie) {
	var cookieToSet = cloneCookie(cookie);
	cookieToSet.url = "http" + (cookieToSet.secure ? "s" : "") + "://" + cookieToSet.domain.replace(/^\./, "");
	delete cookieToSet.hostOnly;
	delete cookieToSet.session;
	return cookieToSet;
}

function reloadActiveTab() {
	chrome.tabs.query({active: true, currentWindow: true}, function(arrayOfTabs) {
		chrome.scripting.executeScript({
			target: { tabId: arrayOfTabs[0].id },
			func: function() { window.location.reload(); }
		});
	});
}

function animateCookieListOut(callback) {
	$('#cookieList').addClass('is-replacing');
	window.setTimeout(function() {
		if (typeof callback === 'function') {
			callback();
		}
	}, 220);
}

function animateCookieCardOut(cookieName, callback) {
	var selector = '.cookie-card[data-cookie-name="' + cookieName.replace(/"/g, '\\"') + '"]';
	var card = $(selector);
	if (!card.length) {
		callback();
		return;
	}
	card.addClass('is-removing');
	window.setTimeout(callback, 220);
}

function animateProfileSwitchStart() {
	$('.active-profile, #profileTable').addClass('is-switching');
}

function animateProfileSwitchEnd() {
	window.setTimeout(function() {
		$('.active-profile, #profileTable').removeClass('is-switching');
	}, 220);
}

function downloadJson(data, name) {
	var dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, undefined, "\t"));
	var link = document.createElement("a");
	link.download = name;
	link.href = dataUri;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

function serializeCookiesToJson(cookies) {
	return JSON.stringify(cookies, undefined, "\t");
}

function serializeCookiesToNetscape(cookies) {
	var lines = [
		'# Netscape HTTP Cookie File',
		'# This file was generated by Cookie Profile Switcher.',
		'# Format: domain\tincludeSubdomains\tpath\tsecure\texpires\tname\tvalue'
	];

	for (var i = 0; i < cookies.length; i++) {
		var cookie = cookies[i];
		var domain = cookie.domain || currentDomain;
		var includeSubdomains = domain.charAt(0) === '.' ? 'TRUE' : 'FALSE';
		var path = cookie.path || '/';
		var secure = cookie.secure ? 'TRUE' : 'FALSE';
		var expires = typeof cookie.expirationDate === 'number' ? Math.floor(cookie.expirationDate) : 0;
		var name = cookie.name || '';
		var value = cookie.value || '';
		lines.push([domain, includeSubdomains, path, secure, expires, name, value].join('\t'));
	}

	return lines.join('\n');
}

function parseImportedCookies(rawText) {
	var text = rawText.replace(/\r\n/g, '\n').trim();
	if (!text) {
		return [];
	}

	if (text.charAt(0) === '[' || text.charAt(0) === '{') {
		var parsedJson = JSON.parse(text);
		if (!Array.isArray(parsedJson)) {
			throw new Error('Invalid JSON cookie payload');
		}
		return parsedJson;
	}

	var lines = text.split('\n');
	var importedCookies = [];
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim();
		if (!line || line.charAt(0) === '#') {
			continue;
		}

		var parts = line.split('\t');
		if (parts.length < 7) {
			continue;
		}

		var domain = parts[0];
		var path = parts[2] || '/';
		var secure = parts[3] === 'TRUE';
		var expires = parseInt(parts[4], 10);
		var name = parts[5] || '';
		var value = parts.slice(6).join('\t');
		var cookie = {
			domain: domain,
			path: path,
			secure: secure,
			httpOnly: false,
			name: name,
			value: value
		};

		if (!isNaN(expires) && expires > 0) {
			cookie.expirationDate = expires;
		}

		importedCookies.push(cookie);
	}

	return importedCookies;
}

function sanitizeImportedCookies(cookies) {
	var sanitized = [];
	for (var i = 0; i < cookies.length; i++) {
		var cookie = cloneCookie(cookies[i]);
		if (!cookie.name) {
			continue;
		}
		if (!cookie.domain) {
			cookie.domain = currentDomain;
		}
		if (!cookie.path) {
			cookie.path = '/';
		}
		if (typeof cookie.secure !== 'boolean') {
			cookie.secure = url.indexOf('https://') === 0;
		}
		if (typeof cookie.httpOnly !== 'boolean') {
			cookie.httpOnly = false;
		}
		sanitized.push(cookie);
	}
	return sanitized;
}

function closeTransferPanel() {
	transferMode = null;
	if (transferHideTimer) {
		window.clearTimeout(transferHideTimer);
	}
	$('#transferPanel').removeClass('is-visible');
	transferHideTimer = window.setTimeout(function() {
		$('#transferPanel').prop('hidden', true);
	}, 220);
	$('#transferTextarea').val('');
}

function openTransferPanel(mode, title, caption, value, canApply) {
	if (transferHideTimer) {
		window.clearTimeout(transferHideTimer);
	}
	transferMode = mode;
	$('#transferPanelTitle').text(title);
	$('#transferPanelCaption').text(caption);
	$('#transferTextarea').val(value || '');
	$('#applyTransfer_button').toggle(canApply);
	$('#transferPanel').prop('hidden', false);
	window.requestAnimationFrame(function() {
		$('#transferPanel').addClass('is-visible');
	});
}

function closeExportOptions() {
	$('#exportGroup').removeClass('is-open');
}

function toggleExportOptions(event) {
	event.preventDefault();
	$('#exportGroup').toggleClass('is-open');
}

function saveCookiesToActiveProfile(cookies, callback) {
	getStorageSnapshot(function(snapshot) {
	chrome.storage.local.get('profiles', function(items) {
		var profileStore = getProfileStore(items);
		var domainProfile = getDomainProfile(items);
		var currentProfileName = domainProfile.currentProfile || "Profile 1";
		domainProfile.profileData[currentProfileName] = cookies.map(cloneCookie);
		if (snapshot) {
			domainProfile.storageData = domainProfile.storageData || {};
			domainProfile.storageData[currentProfileName] = snapshot;
		}
		profileStore[currentDomain] = domainProfile;
		chrome.storage.local.set({ "profiles": profileStore }, function() {
			if (typeof callback === 'function') {
				callback();
			}
		});
	});
	});
}

function addProfileListeners() {
	var switchProfileLinks = document.getElementsByClassName("switchProfile");
	for (var i = 0; i < switchProfileLinks.length; i++) {
		switchProfileLinks[i].addEventListener('click', changeProfile, false);
	}

	var editProfileLinks = document.getElementsByClassName("editProfile");
	for (var j = 0; j < editProfileLinks.length; j++) {
		editProfileLinks[j].addEventListener('click', editProfile, false);
	}

	var removeProfileLinks = document.getElementsByClassName("removeProfile");
	for (var k = 0; k < removeProfileLinks.length; k++) {
		removeProfileLinks[k].addEventListener('click', removeProfile, false);
	}
}

function editProfile(event) {
	event.preventDefault();
	var target = event.currentTarget;
	$(target).html("Save");
	$(target).parent().parent().parent().find('.switchProfile').hide();
	$(target).parent().parent().parent().find('.profileLabel').hide();
	$(target).parent().parent().parent().find('input').removeAttr('hidden').show();
	target.removeEventListener('click', editProfile, false);
	target.addEventListener('click', saveProfileName, false);
}

function saveProfileName(event) {
	event.preventDefault();
	var target = event.currentTarget;
	var oldProfileName = target.getAttribute('data-profileName');
	var newProfileName = $(target).parent().parent().parent().find('input').val();

	if (!newProfileName || newProfileName === oldProfileName) {
		loadProfiles();
		return;
	}

	chrome.storage.local.get('profiles', function(items) {
		var profileStore = getProfileStore(items);
		var domainProfile = getDomainProfile(items);
		var previousProfileData = cloneCookie(normalizeCookieArray(domainProfile.profileData[oldProfileName]));

		delete domainProfile.profileData[oldProfileName];
		domainProfile.profileData[newProfileName] = previousProfileData;
		if (domainProfile.storageData && domainProfile.storageData[oldProfileName]) {
			domainProfile.storageData[newProfileName] = domainProfile.storageData[oldProfileName];
			delete domainProfile.storageData[oldProfileName];
		}

		if (domainProfile.currentProfile == oldProfileName) {
			domainProfile.currentProfile = newProfileName;
		}

		profileStore[currentDomain] = domainProfile;
		chrome.storage.local.set({ "profiles": profileStore }, function() {
			loadProfiles();
			setStatus('Profile renamed');
		});
	});
}

function removeProfile(event) {
	event.preventDefault();
	var target = event.currentTarget.getAttribute('data-profileName');

	chrome.storage.local.get('profiles', function(items) {
		var profileStore = getProfileStore(items);
		var domainProfile = getDomainProfile(items);
		var currentProfileName = trackedProfileName;

		delete domainProfile.profileData[target];
		if (domainProfile.storageData) {
			delete domainProfile.storageData[target];
		}

		var remainingProfiles = Object.keys(domainProfile.profileData);
		if (remainingProfiles.length === 0) {
			domainProfile = getDefaultDomainProfile();
			remainingProfiles = Object.keys(domainProfile.profileData);
		}

		var nextProfileName = remainingProfiles[0];
		if (currentProfileName == target) {
			domainProfile.currentProfile = nextProfileName;
		}

		profileStore[currentDomain] = domainProfile;
		chrome.storage.local.set({ "profiles": profileStore }, function() {
			if (currentProfileName == target) {
				changeProfile({ target: { innerHTML: nextProfileName }, saveData: false });
			}
			loadProfiles();
			setStatus('Profile removed');
		});
	});
}

function loadProfiles() {
	if (origProfileTable == "") {
		origProfileTable = $('#profileTable').html();
	} else {
		$('#profileTable').html(origProfileTable);
	}

	chrome.storage.local.get('profiles', function(items) {
		var domainProfile = getDomainProfile(items);
		var currentProfileName = domainProfile.currentProfile;
		trackedProfileName = currentProfileName;
		$('#profile_label').text(currentProfileName);

		for (var profileName in domainProfile.profileData) {
			if (typeof domainProfile.profileData[profileName] !== 'function') {
				var tableRef = document.getElementById('profileTable').getElementsByTagName('tbody')[0];
				var newRow = tableRef.insertRow(tableRef.rows.length - 1);
				var newCell = newRow.insertCell(0);
				var textbox = document.createElement('input');
				textbox.setAttribute("hidden", "true");
				textbox.type = "textbox";
				textbox.setAttribute("value", profileName);

				var activeLabel = document.createElement('a');
				var isActiveProfile = currentProfileName === profileName;
				activeLabel.className = isActiveProfile ? "profileLabel" : "profileLabel profileLabel-muted";
				activeLabel.appendChild(document.createTextNode(profileName));
				newCell.appendChild(activeLabel);

				newCell.appendChild(textbox);

				var newCell2 = newRow.insertCell(1);
				newCell2.className = "no-wrap";
				var editLink = document.createElement('a');
				editLink.appendChild(document.createTextNode("Edit"));
				editLink.href = "#";
				editLink.setAttribute('data-profileName', profileName);
				editLink.className = "editProfile";

				var switchLink = document.createElement('a');
				switchLink.appendChild(document.createTextNode("Switch"));
				switchLink.href = "#";
				switchLink.setAttribute('data-profileName', profileName);
				switchLink.className = "switchProfile";
				if (isActiveProfile) {
					switchLink.style.display = "none";
				}

				var removeLink = document.createElement('a');
				removeLink.appendChild(document.createTextNode("Remove"));
				removeLink.href = "#";
				removeLink.setAttribute('data-profileName', profileName);
				removeLink.className = "removeProfile";

				var cellSpan = document.createElement('span');
				cellSpan.appendChild(switchLink);
				cellSpan.appendChild(document.createTextNode(" "));
				cellSpan.appendChild(editLink);
				cellSpan.appendChild(document.createTextNode(" "));
				cellSpan.appendChild(removeLink);
				cellSpan.className = "smallText";

				newCell2.appendChild(cellSpan);
			}
		}

		var bodyRef = document.getElementById('profileTable').getElementsByTagName('tbody')[0];
		if (bodyRef.rows.length < 4 && bodyRef.getElementsByClassName('removeProfile')[0]) {
			bodyRef.getElementsByClassName('removeProfile')[0].parentNode.removeChild(bodyRef.getElementsByClassName('removeProfile')[0]);
		}

		addProfileListeners();
		loadDomainCookieStore();
	});
}

function newProfile(event) {
	if (event && event.preventDefault) {
		event.preventDefault();
	}

	chrome.storage.local.get('profiles', function(items) {
		var newProfileName = $('#profileName_input').val();
		if (!newProfileName) {
			return;
		}

		var profileStore = getProfileStore(items);
		var domainProfile = getDomainProfile(items);
		domainProfile.profileData[newProfileName] = [];
		domainProfile.storageData = domainProfile.storageData || {};
		domainProfile.storageData[newProfileName] = {};
		profileStore[currentDomain] = domainProfile;

		chrome.storage.local.set({ "profiles": profileStore }, function() {
			$('#profileName_input').val('');
			loadProfiles();
			setStatus('Profile created');
		});
	});
}

function changeProfile(event) {
	if (event && event.preventDefault) {
		event.preventDefault();
	}

	var target = event.currentTarget || event.target;
	var saveData = event.saveData;
	var selectedProfileName = target.getAttribute('data-profileName') || target.innerHTML;
	animateProfileSwitchStart();

	getPageCookies(function(cookies) {
	getStorageSnapshot(function(currentStorage) {
		var currentProfileName = trackedProfileName;

		chrome.storage.local.get('profiles', function(items) {
			var profileStore = getProfileStore(items);
			var domainProfile = getDomainProfile(items);
			var newProfileData = normalizeCookieArray(domainProfile.profileData[selectedProfileName]);

			domainProfile.profileData[currentProfileName] = cookies.map(cloneCookie);
			domainProfile.storageData = domainProfile.storageData || {};
			if (currentStorage) {
				domainProfile.storageData[currentProfileName] = currentStorage;
			}
			var newStorage = domainProfile.storageData[selectedProfileName] || {};
			domainProfile.currentProfile = selectedProfileName;
			trackedProfileName = selectedProfileName;

			var finishSwitch = function() {
				if (currentStorage === null) {
					completeSwitch();
					return;
				}
				runInTab(function(obj) {
					localStorage.clear();
					Object.keys(obj).forEach(function(k) { localStorage.setItem(k, obj[k]); });
				}, [newStorage], completeSwitch);
			};

			var completeSwitch = function() {
				if (typeof saveData === 'undefined' || saveData == true) {
					profileStore[currentDomain] = domainProfile;
					chrome.storage.local.set({ "profiles": profileStore }, function() {
						loadProfiles();
						animateProfileSwitchEnd();
					});
				} else {
					animateProfileSwitchEnd();
				}
				reloadActiveTab();
				setStatus('Profile switched');
			};

			var applyNewCookies = function() {
				var pendingSet = newProfileData.length;
				if (pendingSet === 0) {
					finishSwitch();
					return;
				}
				for (var j = 0; j < newProfileData.length; j++) {
					chrome.cookies.set(sanitizeCookieForSet(newProfileData[j]), function() {
						pendingSet -= 1;
						if (pendingSet === 0) {
							finishSwitch();
						}
					});
				}
			};

			var pendingRemove = cookies.length;
			if (pendingRemove === 0) {
				applyNewCookies();
				return;
			}
			for (var i = 0; i < cookies.length; i++) {
				chrome.cookies.remove({url: extrapolateUrlFromCookie(cookies[i]), name: cookies[i].name}, function() {
					pendingRemove -= 1;
					if (pendingRemove === 0) {
						applyNewCookies();
					}
				});
			}
		});
		});
	});
}

function renderCookieEditor() {
	if (editorMode === 'storage') {
		renderStorageEditor();
		return;
	}
	var filterValue = ($('#cookieFilter_input').val() || '').toLowerCase();
	var list = $('#cookieList');
	list.empty();

	var filteredCookies = liveCookies.filter(function(cookie) {
		return !filterValue ||
			cookie.name.toLowerCase().indexOf(filterValue) !== -1 ||
			String(cookie.value || '').toLowerCase().indexOf(filterValue) !== -1;
	});

	if (filteredCookies.length === 0) {
		list.append('<div class="cookie-empty">No cookies match this filter.</div>');
		return;
	}

	for (var i = 0; i < filteredCookies.length; i++) {
		var cookie = filteredCookies[i];
		var cookieNameAttr = cookie.name.replace(/"/g, '&quot;');
		var cardHtml = ''
			+ '<div class="cookie-card" data-cookie-name="' + cookieNameAttr + '">'
			+ '<div class="cookie-card-header">'
			+ '<div class="cookie-name">' + $('<div>').text(cookie.name).html() + '</div>'
			+ '<a href="#" class="tool-button delete-cookie-button" data-cookie-name="' + cookieNameAttr + '">Delete</a>'
			+ '</div>'
			+ '<div class="cookie-meta">' + $('<div>').text((cookie.domain || currentDomain) + (cookie.path || '/')).html() + '</div>'
			+ '<textarea class="cookie-value" data-cookie-name="' + cookieNameAttr + '">' + $('<div>').text(cookie.value || '').html() + '</textarea>'
			+ '<div class="cookie-editor-actions">'
			+ '<a href="#" class="tool-button save-cookie-button" data-cookie-name="' + cookieNameAttr + '">Apply</a>'
			+ '</div>'
			+ '</div>';
		list.append(cardHtml);
	}

	addCookieEditorListeners();
}

function addCookieEditorListeners() {
	var saveButtons = document.getElementsByClassName('save-cookie-button');
	for (var i = 0; i < saveButtons.length; i++) {
		saveButtons[i].addEventListener('click', applyCookieEdit, false);
	}

	var deleteButtons = document.getElementsByClassName('delete-cookie-button');
	for (var j = 0; j < deleteButtons.length; j++) {
		deleteButtons[j].addEventListener('click', deleteCookieEdit, false);
	}
}

function findCookieByName(name) {
	for (var i = 0; i < liveCookies.length; i++) {
		if (liveCookies[i].name === name) {
			return liveCookies[i];
		}
	}
	return null;
}

function applyCookieEdit(event) {
	event.preventDefault();
	if (editorMode === 'storage') {
		applyStorageEdit(event.currentTarget.getAttribute('data-cookie-name'));
		return;
	}
	var cookieName = event.currentTarget.getAttribute('data-cookie-name');
	var cookie = findCookieByName(cookieName);
	var cookieValue = $('.cookie-value[data-cookie-name="' + cookieName.replace(/"/g, '\\"') + '"]').val();

	if (!cookie) {
		setStatus('Cookie not found');
		return;
	}

	cookie.value = cookieValue;
	chrome.cookies.set(sanitizeCookieForSet(cookie), function() {
		setStatus('Cookie updated');
		loadDomainCookieStore();
	});
}

function deleteCookieEdit(event) {
	event.preventDefault();
	if (editorMode === 'storage') {
		deleteStorageEdit(event.currentTarget.getAttribute('data-cookie-name'));
		return;
	}
	var cookieName = event.currentTarget.getAttribute('data-cookie-name');
	var cookie = findCookieByName(cookieName);

	if (!cookie) {
		setStatus('Cookie not found');
		return;
	}

	animateCookieCardOut(cookieName, function() {
		chrome.cookies.remove({url: extrapolateUrlFromCookie(cookie), name: cookie.name}, function() {
			setStatus('Cookie removed');
			loadDomainCookieStore();
		});
	});
}

function addNewCookie(event) {
	event.preventDefault();
	if (editorMode === 'storage') {
		var newKey = 'new_key_' + Date.now();
		storageOp(function(k) { localStorage.setItem(k, ''); }, [newKey], 'Item created');
		return;
	}
	var newCookie = {
		name: 'new_cookie_' + Date.now(),
		value: '',
		domain: currentDomain,
		path: '/',
		secure: url.indexOf('https://') === 0,
		httpOnly: false
	};

	chrome.cookies.set(sanitizeCookieForSet(newCookie), function() {
		setStatus('Cookie created');
		loadDomainCookieStore();
	});
}

function deleteAllCookies(event) {
	event.preventDefault();
	if (editorMode === 'storage') {
		if (liveStorage.length === 0) {
			setStatus('No items to delete');
			return;
		}
		animateCookieListOut(function() {
			storageOp(function() { localStorage.clear(); }, [], 'Local storage cleared');
			$('#deleteActionGroup').addClass('show-refresh');
		});
		return;
	}

	if (liveCookies.length === 0) {
		setStatus('No cookies to delete');
		return;
	}

	animateCookieListOut(function() {
		var pending = liveCookies.length;
		for (var i = 0; i < liveCookies.length; i++) {
			chrome.cookies.remove({url: extrapolateUrlFromCookie(liveCookies[i]), name: liveCookies[i].name}, function() {
				pending -= 1;
				if (pending === 0) {
					setStatus('All cookies removed');
					$('#deleteActionGroup').addClass('show-refresh');
					loadDomainCookieStore();
				}
			});
		}
	});
}

function exportCookiesAsJson(event) {
	event.preventDefault();
	if (editorMode === 'storage') {
		closeExportOptions();
		closeTransferPanel();
		copyToClipboard(serializeStorage(), 'JSON copied');
		showCopyToast('JSON copied');
		return;
	}
	var jsonText = serializeCookiesToJson(liveCookies);
	closeExportOptions();
	closeTransferPanel();
	copyToClipboard(jsonText, 'JSON copied');
	showCopyToast('JSON copied');
}

function importCookies(event) {
	event.preventDefault();
	closeExportOptions();
	if (editorMode === 'storage') {
		openTransferPanel('import', 'Import local storage', 'Paste JSON object or name/value array', '', true);
		return;
	}
	openTransferPanel('import', 'Import cookies', 'Paste JSON or Netscape', '', true);
}

function exportCookiesAsNetscape(event) {
	event.preventDefault();
	if (editorMode === 'storage') {
		exportCookiesAsJson(event);
		return;
	}
	var netscapeText = serializeCookiesToNetscape(liveCookies);
	closeExportOptions();
	closeTransferPanel();
	copyToClipboard(netscapeText, 'Netscape copied');
	showCopyToast('Netscape copied');
}

function applyTransfer(event) {
	event.preventDefault();

	if (transferMode !== 'import') {
		return;
	}

	if (editorMode === 'storage') {
		importStorage($('#transferTextarea').val());
		return;
	}

	var importedCookies;
	try {
		importedCookies = sanitizeImportedCookies(parseImportedCookies($('#transferTextarea').val()));
	} catch (error) {
		setStatus('Invalid import text');
		return;
	}

	animateCookieListOut(function() {
		getPageCookies(function(existingCookies) {
			var pendingRemove = existingCookies.length;
			var finishImport = function() {
				var pendingSet = importedCookies.length;
				var done = function() {
					setStatus('Cookies imported');
					loadDomainCookieStore();
					closeTransferPanel();
				};
				if (pendingSet === 0) {
					done();
					return;
				}
				for (var i = 0; i < importedCookies.length; i++) {
					chrome.cookies.set(sanitizeCookieForSet(importedCookies[i]), function() {
						pendingSet -= 1;
						if (pendingSet === 0) {
							done();
						}
					});
				}
			};

			if (pendingRemove === 0) {
				finishImport();
				return;
			}

			for (var j = 0; j < existingCookies.length; j++) {
				chrome.cookies.remove({url: extrapolateUrlFromCookie(existingCookies[j]), name: existingCookies[j].name}, function() {
					pendingRemove -= 1;
					if (pendingRemove === 0) {
						finishImport();
					}
				});
			}
		});
	});
}

function saveCurrentSessionToProfile(event) {
	event.preventDefault();
	getPageCookies(function(cookies) {
		saveCookiesToActiveProfile(cookies, function() {
			setStatus('Saved to profile');
			loadProfiles();
		});
	});
}

function copyDomain(event) {
	event.preventDefault();
	var text = currentDomain || $('#domain_label').text();

	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text).then(function() {
			setStatus('Domain copied');
		}, function() {
			setStatus('Copy failed');
		});
		return;
	}

	var tempInput = document.createElement('input');
	tempInput.value = text;
	document.body.appendChild(tempInput);
	tempInput.select();
	document.execCommand('copy');
	document.body.removeChild(tempInput);
	setStatus('Domain copied');
}

function refreshTab(event) {
	event.preventDefault();
	reloadActiveTab();
	setStatus('Refreshing');
}

function toggleEditor(event) {
	if (event) {
		event.preventDefault();
	}

	editorVisible = !editorVisible;
	$(popupShell).toggleClass('editor-mode', editorVisible);
	setStatus(editorVisible ? 'Editor open' : 'Ready');
	if (editorVisible) {
		loadEditorData();
	} else {
		$('#deleteActionGroup').removeClass('show-refresh');
		closeExportOptions();
		closeTransferPanel();
	}
}

function getStorageSnapshot(callback) {
	runInTab(function() {
		var out = {};
		for (var i = 0; i < localStorage.length; i++) {
			var key = localStorage.key(i);
			out[key] = localStorage.getItem(key);
		}
		return out;
	}, [], function(result) {
		callback(result === null || result === true ? null : result);
	});
}

function runInTab(func, args, callback) {
	if (!tab || typeof tab.id !== 'number' || !chrome.scripting) {
		callback(null);
		return;
	}
	chrome.scripting.executeScript({target: {tabId: tab.id}, func: func, args: args || []}, function(results) {
		if (chrome.runtime.lastError || !results || !results[0]) {
			callback(null);
			return;
		}
		callback(results[0].result === undefined ? true : results[0].result);
	});
}

function storageOp(func, args, okMessage) {
	runInTab(func, args, function(result) {
		setStatus(result === null ? 'Cannot access page storage' : okMessage);
		loadStorageStore();
	});
}

function loadStorageStore() {
	runInTab(function() {
		var out = [];
		for (var i = 0; i < localStorage.length; i++) {
			var key = localStorage.key(i);
			out.push({name: key, value: localStorage.getItem(key)});
		}
		return out;
	}, [], function(items) {
		if (items === null) {
			setStatus('Cannot access page storage');
			items = [];
		}
		liveStorage = items;
		setEditorCookieCount(liveStorage.length);
		$('#editor_domain_label').text(currentDomain);
		renderStorageEditor();
		window.requestAnimationFrame(function() {
			$('#cookieList').removeClass('is-replacing');
		});
	});
}

function renderStorageEditor() {
	var filterValue = ($('#cookieFilter_input').val() || '').toLowerCase();
	var list = $('#cookieList');
	list.empty();

	var filtered = liveStorage.filter(function(item) {
		return !filterValue ||
			item.name.toLowerCase().indexOf(filterValue) !== -1 ||
			String(item.value || '').toLowerCase().indexOf(filterValue) !== -1;
	});

	if (filtered.length === 0) {
		list.append('<div class="cookie-empty">No local storage items match this filter.</div>');
		return;
	}

	for (var i = 0; i < filtered.length; i++) {
		var item = filtered[i];
		var nameAttr = item.name.replace(/"/g, '&quot;');
		list.append(''
			+ '<div class="cookie-card" data-cookie-name="' + nameAttr + '">'
			+ '<div class="cookie-card-header">'
			+ '<div class="cookie-name">' + $('<div>').text(item.name).html() + '</div>'
			+ '<a href="#" class="tool-button delete-cookie-button" data-cookie-name="' + nameAttr + '">Delete</a>'
			+ '</div>'
			+ '<div class="cookie-meta">localStorage</div>'
			+ '<textarea class="cookie-value" data-cookie-name="' + nameAttr + '">' + $('<div>').text(item.value || '').html() + '</textarea>'
			+ '<div class="cookie-editor-actions">'
			+ '<a href="#" class="tool-button save-cookie-button" data-cookie-name="' + nameAttr + '">Apply</a>'
			+ '</div>'
			+ '</div>');
	}

	addCookieEditorListeners();
}

function applyStorageEdit(name) {
	var value = $('.cookie-value[data-cookie-name="' + name.replace(/"/g, '\\"') + '"]').val();
	storageOp(function(k, v) { localStorage.setItem(k, v); }, [name, value], 'Item updated');
}

function deleteStorageEdit(name) {
	animateCookieCardOut(name, function() {
		storageOp(function(k) { localStorage.removeItem(k); }, [name], 'Item removed');
	});
}

function serializeStorage() {
	var obj = {};
	liveStorage.forEach(function(item) {
		obj[item.name] = item.value;
	});
	return JSON.stringify(obj, null, 2);
}

function importStorage(text) {
	var entries = {};
	try {
		var parsed = JSON.parse(text);
		if (Array.isArray(parsed)) {
			parsed.forEach(function(item) {
				entries[item.name] = item.value;
			});
		} else if (parsed && typeof parsed === 'object') {
			entries = parsed;
		} else {
			throw new Error('bad');
		}
	} catch (error) {
		setStatus('Invalid import text');
		return;
	}
	Object.keys(entries).forEach(function(k) {
		if (typeof entries[k] !== 'string') {
			entries[k] = JSON.stringify(entries[k]);
		}
	});
	closeTransferPanel();
	storageOp(function(obj) {
		Object.keys(obj).forEach(function(k) { localStorage.setItem(k, obj[k]); });
	}, [entries], 'Local storage imported');
}

function loadEditorData() {
	if (editorMode === 'storage') {
		loadStorageStore();
	} else {
		loadDomainCookieStore();
	}
}

function setEditorMode(mode) {
	editorMode = mode;
	var storage = mode === 'storage';
	$('#modeCookies_button').toggleClass('tool-button-primary', !storage);
	$('#modeStorage_button').toggleClass('tool-button-primary', storage);
	$('#editorCaption').text(storage ? 'Live storage editor' : 'Live cookie editor');
	$('#editorTitle').text(storage ? 'Current page local storage' : 'Current domain cookies');
	$('#editorCountLabel').text(storage ? 'items' : 'live cookies');
	$('#cookieFilter_input').attr('placeholder', storage ? 'Filter items' : 'Filter cookies');
	$('#cookieList').empty();
	loadEditorData();
}

function getPageCookies(callback) {
	var finish = function(extraHosts) {
		var domains = {};
		domains[currentDomain] = true;
		for (var i = 0; i < extraHosts.length; i++) {
			var d = getDomain('https://' + extraHosts[i] + '/');
			if (d) {
				domains[d] = true;
			}
		}
		var names = Object.keys(domains);
		var seen = {};
		var merged = [];
		var pending = names.length;
		names.forEach(function(domainName) {
			chrome.cookies.getAll({domain: domainName}, function(found) {
				(found || []).forEach(function(c) {
					var key = c.domain + '|' + c.path + '|' + c.name + '|' + (c.storeId || '');
					if (!seen[key]) {
						seen[key] = true;
						merged.push(c);
					}
				});
				pending -= 1;
				if (pending === 0) {
					callback(merged);
				}
			});
		});
	};

	if (!tab || typeof tab.id !== 'number' || !chrome.scripting) {
		finish([]);
		return;
	}
	chrome.scripting.executeScript({
		target: {tabId: tab.id},
		func: function() {
			var hosts = {};
			performance.getEntriesByType('resource').forEach(function(e) {
				try { hosts[new URL(e.name).hostname] = true; } catch (err) {}
			});
			return Object.keys(hosts);
		}
	}, function(results) {
		var hosts = (!chrome.runtime.lastError && results && results[0] && results[0].result) || [];
		finish(hosts);
	});
}

function loadDomainCookieStore() {
	getPageCookies(function(cookies) {
		liveCookies = cookies.map(cloneCookie);
		$('#cookie_count').text(liveCookies.length);
		setEditorCookieCount(liveCookies.length);
		$('#editor_domain_label').text(currentDomain);
		renderCookieEditor();
		window.requestAnimationFrame(function() {
			$('#cookieList').removeClass('is-replacing');
		});
	});
}

function domainLoaded() {
	document.getElementById('domain_label').textContent = currentDomain;
	$('#profileCreate_button').data('domain', currentDomain);
	setStatus('Ready');
}

function init() {
	popupShell = document.getElementById('popupShell');
	chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs) {
		tab = tabs[0];
		url = tab.url;
		currentDomain = getDomain(url);
		domainLoaded();
		loadProfiles();
	});
}

document.addEventListener('DOMContentLoaded', function() {
	init();
	var bind = function(selector, eventName, handler) {
		var element = document.querySelector(selector);
		if (element) {
			element.addEventListener(eventName, handler);
		}
	};

	bind('#profileCreate_button', 'click', newProfile);
	bind('#saveSession_button', 'click', saveCurrentSessionToProfile);
	bind('#copyDomain_button', 'click', copyDomain);
	bind('#refreshTab_button', 'click', refreshTab);
	bind('#toggleEditor_button', 'click', toggleEditor);
	bind('#closeEditor_button', 'click', toggleEditor);
	bind('#addCookie_button', 'click', addNewCookie);
	bind('#deleteAllCookies_button', 'click', deleteAllCookies);
	bind('#refreshAfterDelete_button', 'click', refreshTab);
	bind('#toggleExportOptions_button', 'click', toggleExportOptions);
	bind('#exportJson_button', 'click', exportCookiesAsJson);
	bind('#exportNetscape_button', 'click', exportCookiesAsNetscape);
	bind('#importCookies_button', 'click', importCookies);
	bind('#closeTransfer_button', 'click', function(event) {
		event.preventDefault();
		closeTransferPanel();
	});
	bind('#applyTransfer_button', 'click', applyTransfer);
	bind('#cookieFilter_input', 'input', renderCookieEditor);
	bind('#modeCookies_button', 'click', function(event) {
		event.preventDefault();
		setEditorMode('cookies');
	});
	bind('#modeStorage_button', 'click', function(event) {
		event.preventDefault();
		setEditorMode('storage');
	});
});
