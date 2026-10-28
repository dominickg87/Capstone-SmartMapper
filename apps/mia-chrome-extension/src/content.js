const PIN_CLASS = 'mia-map-pin-icon';
const FLOATING_PIN_CLASS = 'mia-floating-pin-icon';
const ADDRESS_TABLE_XPATH =
  '/html/body/div[3]/div[1]/div[2]/div[1]/div/div/div/div/div[4]/div/div/div/div[2]/div/div/div[1]/table';
const NOWCERTS_HEADER_ADDRESS_XPATHS = [
  '/html/body/form/div[7]/div[3]/application-insurance/application-intro/insureds-master/insureds-details/insureds-board-details/div[2]/div[1]/div/div/div/div/div[1]/div/span[2]/span/ncm-google-address/span/span[2]',
  '//insureds-board-details//ncm-google-address/span/span[2]',
];
const NOWCERTS_HEADER_MAP_PIN_XPATHS = [
  '/html/body/form/div[7]/div[3]/application-insurance/application-intro/insureds-master/insureds-details/insureds-board-details/div[2]/div[1]/div/div/div/div/div[1]/div/span[2]/span/ncm-google-address/span/span[3]/span',
  '//insureds-board-details//ncm-google-address/span/span[3]/span',
];
const IS_AMS_HOST = /(^|\.)ams360\.com$/i.test(window.location.hostname);
const IS_NOWCERTS_HOST = /(^|\.)nowcerts\.com$/i.test(window.location.hostname);

let injectionAttempts = 0;
let missingAddressLogged = false;

function openPanelWithAddress(address) {
  if (address) {
    chrome.runtime
      .sendMessage({
        type: 'MIA_ADDRESS_UPDATE',
        payload: { address },
      })
      .catch(() => {
        /* best effort */
      });
  }

  chrome.runtime
    .sendMessage({
      type: 'MIA_OPEN_PANEL',
      payload: address ? { address } : {},
    })
    .catch((error) => {
      console.error('MIA extension: failed to open side panel', error);
    });
}

function buildPinElement() {
  const pin = document.createElement('img');
  pin.src = chrome.runtime.getURL('icons/pin2.png');
  pin.alt = 'Open MIA Side Panel';
  pin.className = PIN_CLASS;

  Object.assign(pin.style, {
    display: 'inline-block',
    verticalAlign: 'middle',
    marginLeft: '6px',
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  });

  pin.addEventListener('click', (event) => {
    const target = event.currentTarget;
    if (!target || !(target instanceof HTMLImageElement)) {
      return;
    }

    const address = target.dataset.fullAddress;
    if (!address) {
      return;
    }
    openPanelWithAddress(address);
  });

  return pin;
}

function ensureFloatingPin() {
  let floatingPin = document.querySelector(`.${FLOATING_PIN_CLASS}`);
  if (floatingPin) {
    return;
  }

  floatingPin = document.createElement('img');
  floatingPin.src = chrome.runtime.getURL('icons/pin2.png');
  floatingPin.alt = 'Open MIA Side Panel';
  floatingPin.className = FLOATING_PIN_CLASS;
  floatingPin.title = 'Open MIA Side Panel';

  Object.assign(floatingPin.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    width: '28px',
    height: '28px',
    cursor: 'pointer',
    zIndex: '2147483647',
    borderRadius: '999px',
    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)',
    backgroundColor: '#ffffff',
  });

  floatingPin.addEventListener('click', () => {
    openPanelWithAddress('');
  });

  document.body.appendChild(floatingPin);
}

function ensurePin(targetElement, fullAddress, options = {}) {
  if (!targetElement) {
    return;
  }

  const insertAfter = options.insertAfter === true;
  let pin;

  if (insertAfter) {
    const sibling = targetElement.nextElementSibling;
    if (sibling && sibling.classList.contains(PIN_CLASS)) {
      pin = sibling;
    } else {
      pin = buildPinElement();
      targetElement.insertAdjacentElement('afterend', pin);
    }
  } else {
    pin = targetElement.querySelector(`.${PIN_CLASS}`);
    if (!pin) {
      pin = buildPinElement();
      targetElement.appendChild(pin);
    }
  }

  if (pin instanceof HTMLImageElement) {
    pin.dataset.fullAddress = fullAddress;
    pin.title = `Open tools for ${fullAddress}`;
  }
}

function evaluateFirstNode(xpaths) {
  for (const xpath of xpaths) {
    const node = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (node instanceof HTMLElement) {
      return node;
    }
  }

  return null;
}

function extractAddressParts() {
  if (IS_NOWCERTS_HOST) {
    const headerAddress = evaluateFirstNode(NOWCERTS_HEADER_ADDRESS_XPATHS);
    const headerMapPin = evaluateFirstNode(NOWCERTS_HEADER_MAP_PIN_XPATHS);

    const fullAddress = headerAddress instanceof HTMLElement ? headerAddress.innerText.trim() : '';
    if (fullAddress && headerMapPin instanceof HTMLElement) {
      return {
        fullAddress,
        anchor: headerMapPin,
        insertAfter: true,
      };
    }

    if (fullAddress && headerAddress instanceof HTMLElement) {
      return {
        fullAddress,
        anchor: headerAddress,
      };
    }

    // Fallback for minor layout shifts: keep pin near the same header component.
    const fallbackAddress = document.querySelector('ncm-google-address span span:nth-child(2)');
    const fallbackMapPin = document.querySelector('ncm-google-address span span:nth-child(3) span');
    const fallbackText =
      fallbackAddress instanceof HTMLElement ? fallbackAddress.innerText.trim() : '';
    if (fallbackText && fallbackMapPin instanceof HTMLElement) {
      return {
        fullAddress: fallbackText,
        anchor: fallbackMapPin,
        insertAfter: true,
      };
    }

    return null;
  }

  if (IS_AMS_HOST) {
    const table = document.evaluate(
      ADDRESS_TABLE_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!(table instanceof HTMLTableElement)) {
      return null;
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) {
      return null;
    }

    const row1Cells = rows[0].querySelectorAll('td');
    const row2Cells = rows[1].querySelectorAll('td');
    const line1 = row1Cells.length > 1 ? row1Cells[1].innerText.trim() : '';
    const line2 = row2Cells.length > 1 ? row2Cells[1].innerText.trim() : '';

    const anchorCell = row1Cells.length > 1 ? row1Cells[1] : null;

    if (!line1 || !line2 || !anchorCell) {
      return null;
    }

    const span = anchorCell.querySelector('p > span') || anchorCell;
    return {
      fullAddress: `${line1} ${line2}`.trim(),
      anchor: span,
    };
  }

  return null;
}

function tryInjectPin(maxRetries = 10) {
  const details = extractAddressParts();

  if (!details) {
    if (injectionAttempts < maxRetries) {
      injectionAttempts += 1;
      setTimeout(() => tryInjectPin(maxRetries), 800);
    } else {
      if (!missingAddressLogged) {
        console.warn('MIA extension: unable to locate address details on the current page.');
        missingAddressLogged = true;
      }
    }
    return;
  }

  injectionAttempts = 0;
  missingAddressLogged = false;
  ensurePin(details.anchor, details.fullAddress, { insertAfter: details.insertAfter });
  if (IS_NOWCERTS_HOST) {
    const floatingPin = document.querySelector(`.${FLOATING_PIN_CLASS}`);
    if (floatingPin instanceof HTMLElement) {
      floatingPin.remove();
    }
  }
}

const observer = new MutationObserver(() => {
  if (IS_AMS_HOST) {
    tryInjectPin();
    return;
  }

  if (IS_NOWCERTS_HOST) {
    tryInjectPin();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

if (IS_AMS_HOST) {
  setTimeout(() => tryInjectPin(), 2000);
}

if (IS_NOWCERTS_HOST) {
  setTimeout(() => tryInjectPin(), 1000);
}

setInterval(() => {
  if (IS_AMS_HOST) {
    const existingPin = document.querySelector(`.${PIN_CLASS}`);
    if (!existingPin) {
      tryInjectPin();
    }
    return;
  }

  if (IS_NOWCERTS_HOST) {
    const existingPin = document.querySelector(`.${PIN_CLASS}`);
    if (!existingPin) {
      tryInjectPin();
      const retryPin = document.querySelector(`.${PIN_CLASS}`);
      if (!retryPin) {
        ensureFloatingPin();
      }
    }
  }
}, 5000);
