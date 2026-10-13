import { test } from './fixtures.js';
import { registerApiSteps, registerUiSteps, registerSharedSteps, registerHybridSuite } from '@esimplicitylabs/katalyst-xspec/steps';

registerApiSteps(test);
registerUiSteps(test);
registerSharedSteps(test);
registerHybridSuite(test);

export { test };
