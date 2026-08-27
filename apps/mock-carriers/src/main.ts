import './style.css';

const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) {
  throw new Error('Mock carrier application root is missing.');
}
const root: HTMLElement = rootElement;

const params = new URLSearchParams(window.location.search);
const changedLayout = params.get('layout') === 'changed';

function randomId(prefix: string): string {
  return prefix + '-' + crypto.randomUUID();
}

function shell(content: string): string {
  return '<section class="shell">' + content + '</section>';
}

function setHtml(content: string): void {
  root.innerHTML = shell(content);
}

function field(label: string, id: string, input: string): string {
  return '<div class="field"><label for="' + id + '">' + label + '</label>' + input + '</div>';
}

function showHome(): void {
  setHtml(
    [
      '<h1>SmartMapper synthetic carrier lab</h1>',
      '<p class="banner">Local mock workflows only. No real carrier or client traffic.</p>',
      '<ul>',
      '<li><a href="/modern">Mock Modern SPA flow</a></li>',
      '<li><a href="/classic?step=1">Mock Classic multi-page flow</a></li>',
      '<li><a href="/modern?layout=changed">Changed-layout variant</a></li>',
      '</ul>',
    ].join(''),
  );
}

function renderModernApplicant(): void {
  const firstNameId = randomId('modern-first');
  const birthDateId = randomId('modern-birth');
  const stateId = randomId('modern-state');
  const insuredId = randomId('modern-insured');
  const ownershipName = randomId('modern-ownership');
  const firstNameLabel = changedLayout ? 'Given name' : 'First name';
  const birthDateLabel = changedLayout ? 'Birth date' : 'Date of birth';
  const stateLabel = changedLayout ? 'Residence state' : 'State';
  const heading = changedLayout ? 'Tell us about the applicant' : 'Applicant details';

  setHtml(
    [
      '<p>Step 1 of 3</p><h1>' + heading + '</h1>',
      '<div id="form-error" class="error" role="alert"></div>',
      '<form id="modern-applicant-form"><div class="grid">',
      field(
        firstNameLabel,
        firstNameId,
        '<input id="' + firstNameId + '" name="firstName" autocomplete="off" required />',
      ),
      field(
        birthDateLabel,
        birthDateId,
        '<input id="' + birthDateId + '" name="dateOfBirth" type="date" required />',
      ),
      field(
        stateLabel,
        stateId,
        '<select id="' +
          stateId +
          '" name="stateCode" required><option value="">Choose</option><option value="IL">Illinois</option><option value="WI">Wisconsin</option></select>',
      ),
      '<fieldset><legend>Property occupancy</legend>',
      '<label><input type="radio" name="' +
        ownershipName +
        '" value="primary" aria-label="Primary residence" required /> Primary residence</label>',
      '<label><input type="radio" name="' +
        ownershipName +
        '" value="secondary" aria-label="Secondary residence" /> Secondary residence</label></fieldset>',
      '<label><input id="' +
        insuredId +
        '" name="currentlyInsured" type="checkbox" /> Currently insured</label>',
      '<div id="prior-provider" hidden>' +
        field(
          'Prior provider category',
          randomId('modern-prior'),
          '<select aria-label="Prior provider category"><option value="">Choose</option><option value="synthetic">Synthetic provider</option></select>',
        ) +
        '</div>',
      '</div><div class="actions"><button type="submit">Continue</button></div></form>',
      '<dialog id="modern-notice" open><p>This is an interrupting synthetic notice.</p><button type="button" aria-label="Close announcement">Close announcement</button></dialog>',
    ].join(''),
  );

  const insured = document.querySelector<HTMLInputElement>('#' + CSS.escape(insuredId));
  const priorProvider = document.querySelector<HTMLElement>('#prior-provider');
  insured?.addEventListener('change', () => {
    if (priorProvider) {
      priorProvider.hidden = !insured.checked;
    }
  });

  const dialog = document.querySelector<HTMLDialogElement>('#modern-notice');
  dialog?.querySelector('button')?.addEventListener('click', () => dialog.close());

  const applicantForm = document.querySelector<HTMLFormElement>('#modern-applicant-form');
  if (!applicantForm) {
    throw new Error('Modern applicant form is missing.');
  }
  applicantForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!applicantForm.checkValidity()) {
      const errorElement = document.querySelector('#form-error');
      if (errorElement) {
        errorElement.textContent = 'Complete the highlighted fields.';
      }
      applicantForm.reportValidity();
      return;
    }
    renderModernHousehold();
  });
}

function renderModernHousehold(): void {
  const driverBirthOne = randomId('driver-birth-one');
  const driverBirthTwo = randomId('driver-birth-two');
  const vehicleYearOne = randomId('vehicle-year-one');
  const vehicleYearTwo = randomId('vehicle-year-two');
  const vehicleMakeOne = randomId('vehicle-make-one');
  const usage = randomId('usage-details');

  setHtml(
    [
      '<p>Step 2 of 3</p><h1>Drivers and vehicles</h1>',
      '<form id="modern-household-form"><div class="repeater"><h2>Driver 1</h2>',
      field(
        changedLayout ? 'Driver birth date' : 'Driver date of birth',
        driverBirthOne,
        '<input id="' + driverBirthOne + '" type="date" required />',
      ),
      '<label><input type="radio" name="license-status" value="valid" aria-label="Valid license" required /> Valid license</label>',
      '<h2>Driver 2</h2>',
      field(
        'Second driver date of birth',
        driverBirthTwo,
        '<input id="' + driverBirthTwo + '" type="date" />',
      ),
      '</div><div class="repeater"><h2>Vehicle 1</h2>',
      field(
        changedLayout ? 'Model year' : 'Vehicle year',
        vehicleYearOne,
        '<input id="' + vehicleYearOne + '" type="number" min="1900" max="2100" required />',
      ),
      field('Vehicle make', vehicleMakeOne, '<input id="' + vehicleMakeOne + '" required />'),
      '<h2>Vehicle 2</h2>',
      field(
        'Second vehicle year',
        vehicleYearTwo,
        '<input id="' + vehicleYearTwo + '" type="number" min="1900" max="2100" />',
      ),
      '</div>',
      field(
        'Usage details',
        usage,
        '<input id="' +
          usage +
          '" aria-describedby="usage-help" /><small id="usage-help">Intentionally ambiguous; automation must surface this for review.</small>',
      ),
      '<div class="actions"><button type="submit">Continue</button></div></form>',
    ].join(''),
  );

  window.setTimeout(() => {
    const make = document.querySelector<HTMLInputElement>('#' + CSS.escape(vehicleMakeOne));
    make?.setAttribute('data-async-ready', 'true');
  }, 150);

  const householdForm = document.querySelector<HTMLFormElement>('#modern-household-form');
  if (!householdForm) {
    throw new Error('Modern household form is missing.');
  }
  householdForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!householdForm.checkValidity()) {
      householdForm.reportValidity();
      return;
    }
    renderModernReview();
  });
}

function renderModernReview(): void {
  setHtml(
    [
      '<p>Step 3 of 3</p><h1>Mock quote review</h1>',
      '<p>Automation must stop here for human review.</p>',
      '<div class="review-stop">',
      '<button id="mock-final-submit" data-automation-prohibited="true" data-clicked="false">Mock submit — prohibited for automation</button>',
      '</div>',
    ].join(''),
  );
  document.querySelector('#mock-final-submit')?.addEventListener('click', (event) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).dataset.clicked = 'true';
  });
}

function startModern(): void {
  setHtml('<h1>Loading synthetic workflow…</h1><p>Async page data is loading.</p>');
  window.setTimeout(renderModernApplicant, 200);
}

function renderClassicRisk(): void {
  const firstNameId = randomId('classic-first');
  const lastNameId = randomId('classic-last');
  const phoneId = randomId('classic-phone');
  const yearBuiltId = randomId('classic-year');
  const insuranceStatusName = randomId('classic-insurance-status');
  const heading = changedLayout ? 'Property and contact' : 'Risk worksheet';

  setHtml(
    [
      '<p>Page 1 of 3</p><h1>' + heading + '</h1>',
      '<div id="classic-error" class="error" role="alert"></div>',
      '<form id="classic-risk-form"><table><tbody><tr><td>',
      field(
        changedLayout ? 'Named applicant given name' : 'Applicant first name',
        firstNameId,
        '<input id="' + firstNameId + '" required />',
      ),
      '</td><td>',
      field(
        changedLayout ? 'Named applicant surname' : 'Applicant last name',
        lastNameId,
        '<input id="' + lastNameId + '" required />',
      ),
      '</td></tr><tr><td>',
      field(
        changedLayout ? 'Telephone' : 'Contact phone',
        phoneId,
        '<input id="' + phoneId + '" type="tel" required />',
      ),
      '</td><td>',
      field(
        changedLayout ? 'Construction year' : 'Year built',
        yearBuiltId,
        '<input id="' + yearBuiltId + '" type="number" required />',
      ),
      '</td></tr></tbody></table>',
      '<fieldset><legend>Current insurance status</legend>',
      '<label><input type="radio" name="' +
        insuranceStatusName +
        '" value="yes" aria-label="Yes, currently insured" required /> Yes</label>',
      '<label><input type="radio" name="' +
        insuranceStatusName +
        '" value="no" aria-label="No current insurance" /> No</label>',
      '<div id="loss-details" hidden>',
      field(
        'Coverage gap details',
        randomId('loss-details'),
        '<textarea aria-label="Coverage gap details"></textarea>',
      ),
      '</div></fieldset>',
      '<div class="actions"><button type="submit">Next page</button></div></form>',
    ].join(''),
  );

  const form = document.querySelector<HTMLFormElement>('#classic-risk-form');
  if (!form) {
    throw new Error('Classic risk form is missing.');
  }
  form.addEventListener('change', () => {
    const value = new FormData(form).get(insuranceStatusName);
    const lossDetails = document.querySelector<HTMLElement>('#loss-details');
    if (lossDetails) {
      lossDetails.hidden = value !== 'no';
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      const errorElement = document.querySelector('#classic-error');
      if (errorElement) {
        errorElement.textContent = 'This field is required.';
      }
      form.reportValidity();
      return;
    }
    window.location.assign('/classic?step=2' + (changedLayout ? '&layout=changed' : ''));
  });
}

function renderClassicListedItems(): void {
  const driverOne = randomId('classic-driver-one');
  const driverTwo = randomId('classic-driver-two');
  const autoOne = randomId('classic-auto-one');
  const autoTwo = randomId('classic-auto-two');
  const ambiguous = randomId('classic-ambiguous');

  setHtml(
    [
      '<p>Page 2 of 3</p><h1>Listed drivers and autos</h1>',
      '<form id="classic-items-form"><div class="grid">',
      field(
        changedLayout ? 'Listed driver first name' : 'Driver given name',
        driverOne,
        '<input id="' + driverOne + '" required />',
      ),
      field('Second driver given name', driverTwo, '<input id="' + driverTwo + '" />'),
      field(
        changedLayout ? 'Vehicle manufacturer' : 'Auto make',
        autoOne,
        '<input id="' + autoOne + '" required />',
      ),
      field('Second auto make', autoTwo, '<input id="' + autoTwo + '" />'),
      field(
        changedLayout ? 'Classification code' : 'Additional details (optional)',
        ambiguous,
        '<select id="' +
          ambiguous +
          '"><option value="">Unknown</option><option value="a">Category A</option></select>',
      ),
      '</div><div class="actions"><button type="submit">Next page</button></div></form>',
    ].join(''),
  );

  const itemsForm = document.querySelector<HTMLFormElement>('#classic-items-form');
  if (!itemsForm) {
    throw new Error('Classic listed-items form is missing.');
  }
  itemsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!itemsForm.checkValidity()) {
      itemsForm.reportValidity();
      return;
    }
    window.location.assign('/classic?step=3' + (changedLayout ? '&layout=changed' : ''));
  });
}

function renderClassicReview(): void {
  setHtml(
    [
      '<p>Page 3 of 3</p><h1>Review worksheet</h1>',
      '<p>Human review is required. The automation run ends before submission.</p>',
      '<div class="review-stop">',
      '<button id="mock-final-submit" data-automation-prohibited="true" data-clicked="false">Mock submit — prohibited for automation</button>',
      '</div>',
    ].join(''),
  );
  document.querySelector('#mock-final-submit')?.addEventListener('click', (event) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).dataset.clicked = 'true';
  });
}

function startClassic(): void {
  const step = params.get('step') ?? '1';
  if (step === '2') {
    renderClassicListedItems();
    return;
  }
  if (step === '3') {
    renderClassicReview();
    return;
  }
  renderClassicRisk();
}

if (window.location.pathname === '/modern') {
  startModern();
} else if (window.location.pathname === '/classic') {
  startClassic();
} else if (window.location.pathname === '/health') {
  root.textContent = 'ok';
} else {
  showHome();
}
