import {
  compareReadBack,
  evaluateActionPolicy,
  resolveSourceValue,
  SourceValueNotFoundError,
  type ExecutionContext,
  type Executor,
  type Normalization,
} from '@smartmapper/automation-core';
import type {
  ActionTarget,
  AutomationAction,
  AutomationActionResult,
  CarrierPageSnapshot,
} from '@smartmapper/contracts';
import type { BrowserContext, Locator, Page } from 'playwright';

function occurredAt(): string {
  return new Date().toISOString();
}

function result(
  action: AutomationAction,
  status: AutomationActionResult['status'],
  reasonCode: string,
  options: Pick<AutomationActionResult, 'observedValueHash' | 'readBackMatched'> = {},
): AutomationActionResult {
  const source = 'sourcePath' in action ? { sourcePath: action.sourcePath } : {};
  return {
    version: '1.0',
    actionId: action.actionId,
    status,
    reasonCode,
    ...source,
    ...options,
    occurredAt: occurredAt(),
  };
}

function normalizationFor(action: AutomationAction): Normalization {
  if (action.type === 'setCheckbox' || action.type === 'setRadio') {
    return 'boolean';
  }
  if ('sourcePath' in action && /phone|year/i.test(action.sourcePath)) {
    return 'digits';
  }
  if ('sourcePath' in action && /date/i.test(action.sourcePath)) {
    return 'date';
  }
  return 'case_insensitive';
}

export class PlaywrightRemoteBrowserExecutor implements Executor {
  public readonly mode = 'remote_browser' as const;

  public constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
  ) {}

  private locate(target: ActionTarget): Locator {
    if (target.label) {
      return this.page.getByLabel(target.label, { exact: false }).first();
    }
    if (target.accessibleName) {
      if (target.role) {
        return this.page
          .getByRole(target.role, { name: target.accessibleName, exact: false })
          .first();
      }
      return this.page.getByText(target.accessibleName, { exact: false }).first();
    }
    if (target.name) {
      return this.page.locator('[name="' + target.name.replace(/"/g, '') + '"]').first();
    }
    if (target.stableId) {
      return this.page.locator('#' + target.stableId.replace(/[^a-zA-Z0-9_-]/g, '')).first();
    }
    throw new Error('No supported stable target hint was provided.');
  }

  public async captureSnapshot(): Promise<CarrierPageSnapshot> {
    const headings = await this.page.locator('h1, h2, h3').allTextContents();
    const labels = await this.page.locator('label').allTextContents();
    const validationMessages = await this.page.locator('[role="alert"], .error').allTextContents();
    const controls = await this.page
      .locator('input, select, textarea, button')
      .evaluateAll((elements) =>
        elements.map((element, index) => {
          const htmlElement = element as HTMLInputElement | HTMLSelectElement | HTMLButtonElement;
          const labelledBy = htmlElement.getAttribute('aria-label');
          const id = htmlElement.id;
          const explicitLabel = id
            ? document.querySelector<HTMLLabelElement>('label[for="' + CSS.escape(id) + '"]')
            : null;
          return {
            controlKey: htmlElement.getAttribute('name') ?? id ?? 'control-' + String(index),
            role: htmlElement.getAttribute('role') ?? htmlElement.tagName.toLocaleLowerCase(),
            ...(explicitLabel?.textContent?.trim()
              ? { label: explicitLabel.textContent.trim() }
              : {}),
            ...(labelledBy ? { accessibleName: labelledBy } : {}),
            ...(htmlElement.getAttribute('name')
              ? { name: htmlElement.getAttribute('name')! }
              : {}),
            ...(id ? { stableId: id } : {}),
            ...('type' in htmlElement && htmlElement.type ? { inputType: htmlElement.type } : {}),
            required: 'required' in htmlElement ? htmlElement.required : false,
            disabled: htmlElement.disabled,
            nearbyText: [],
          };
        }),
      );

    return {
      version: '1.0',
      url: this.page.url(),
      title: await this.page.title(),
      headings: headings.map((heading) => heading.trim()).filter(Boolean),
      controls,
      labels: labels.map((label) => label.trim()).filter(Boolean),
      options: await this.page.locator('option').allTextContents(),
      validationMessages: validationMessages.map((message) => message.trim()).filter(Boolean),
      iframes: await this.page.locator('iframe').evaluateAll((elements) =>
        elements.map((element, index) => ({
          frameKey: element.getAttribute('name') ?? 'frame-' + String(index),
          ...(element.getAttribute('title') ? { title: element.getAttribute('title')! } : {}),
          sameOrigin: false,
        })),
      ),
      capturedAt: occurredAt(),
    };
  }

  public async execute(
    action: AutomationAction,
    executionContext: ExecutionContext,
  ): Promise<AutomationActionResult> {
    const policy = evaluateActionPolicy(action);
    if (policy.disposition === 'block') {
      return result(action, 'blocked', policy.reasonCode);
    }
    if (policy.disposition === 'review') {
      return result(action, 'requires_review', policy.reasonCode);
    }

    try {
      if (action.type === 'clickContinue') {
        await this.locate(action.target).click();
        return result(action, 'executed', 'continue_clicked');
      }
      if (action.type === 'waitForPage') {
        await this.page.waitForTimeout(Math.min(action.timeoutMs, 500));
        return result(action, 'executed', 'page_wait_completed');
      }
      if (
        action.type === 'requestHumanInput' ||
        action.type === 'pauseForAuthentication' ||
        action.type === 'stop'
      ) {
        return result(action, 'requires_review', action.type);
      }

      const sourceValue = resolveSourceValue(executionContext.quote, action.sourcePath);
      const locator = this.locate(action.target);
      let observed: unknown;
      let expected: unknown = sourceValue;

      if (action.type === 'fillText') {
        await locator.fill(String(sourceValue));
        observed = await locator.inputValue();
      } else if (action.type === 'selectOption') {
        await locator.selectOption(String(sourceValue));
        observed = await locator.inputValue();
      } else if (action.type === 'setRadio') {
        await this.page.getByRole('radio', { name: action.option, exact: false }).check();
        expected = true;
        observed = await this.page
          .getByRole('radio', { name: action.option, exact: false })
          .isChecked();
      } else {
        const sourceBoolean = Boolean(sourceValue);
        const shouldCheck = action.checkedWhen === 'truthy' ? sourceBoolean : !sourceBoolean;
        await locator.setChecked(shouldCheck);
        expected = shouldCheck;
        observed = await locator.isChecked();
      }

      const comparison = compareReadBack(expected, observed, normalizationFor(action));
      return result(
        action,
        comparison.matches ? 'executed' : 'requires_review',
        'read_back_compared',
        {
          observedValueHash: comparison.observedHash,
          readBackMatched: comparison.matches,
        },
      );
    } catch (error) {
      if (error instanceof SourceValueNotFoundError) {
        return result(action, 'requires_review', 'missing_source');
      }
      return result(action, 'failed', 'executor_error');
    }
  }

  public async pause(_reasonCode: string): Promise<void> {}

  public async resume(): Promise<void> {}

  public async cancel(): Promise<void> {
    await this.context.close();
  }

  public async dispose(): Promise<void> {
    await this.context.close();
  }
}
