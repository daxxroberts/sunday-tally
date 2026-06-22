'use client';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Divider } from '@/components/Divider';
import { Input } from '@/components/Input';
import { Label } from '@/components/Label';

export default function Example() {
  return (
    <div className="obfuscate">
      <div className="sm:mx-auto sm:max-w-2xl">
        <h1 className="mt-6 text-lg font-semibold text-gray-900 dark:text-gray-50">
          Account details
        </h1>
        <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-500">
          Update personal information used for account management and billing.
        </p>
        <form action="#" method="post" className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="first-name" className="font-medium">
                First name
              </Label>
              <Input
                type="text"
                id="first-name"
                name="first-name"
                autoComplete="given-name"
                placeholder="Emma"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="last-name" className="font-medium">
                Last name
              </Label>
              <Input
                type="text"
                id="last-name"
                name="last-name"
                autoComplete="family-name"
                placeholder="Crown"
                className="mt-2"
              />
            </div>
            <div className="col-span-full">
              <Label htmlFor="email" className="font-medium">
                Email
              </Label>
              <Input
                type="text"
                id="email"
                name="email"
                autoComplete="email"
                placeholder="emma@company.com"
                className="mt-2"
              />
            </div>
            <div className="col-span-full">
              <Label htmlFor="address" className="font-medium">
                Address
              </Label>
              <Input
                type="text"
                id="address"
                name="address"
                autoComplete="street-address"
                placeholder="29 Park Street"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-2">
              <Label htmlFor="state" className="font-medium">
                Country
              </Label>
              <Input
                type="text"
                id="country"
                name="country"
                autoComplete="country-name"
                placeholder="Switzerland"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-2">
              <Label htmlFor="city" className="font-medium">
                City
              </Label>
              <Input
                type="text"
                id="city"
                name="city"
                autoComplete="address-level2"
                placeholder="Zurich"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-2">
              <Label htmlFor="postal-code" className="font-medium">
                ZIP / Postal code
              </Label>
              <Input
                id="postal-code"
                name="postal-code"
                autoComplete="postal-code"
                placeholder="8000"
                className="mt-2"
              />
            </div>
          </div>
          <Divider className="!my-12" />
          <div>
            <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Notifications
            </h2>
            <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-500">
              Manage your personal notification settings for this workspace.
              Read the{' '}
              <a
                href="#"
                className="text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
              >
                governance documentation
              </a>{' '}
              to learn more.
            </p>
            <div className="mt-8 space-y-6">
              <div className="relative flex items-start">
                <div className="flex h-6 items-center">
                  <Checkbox
                    id="form-option-1"
                    aria-describedby="form-option-1-description"
                    name="form-option-1"
                  />
                </div>
                <div className="ml-3 text-sm/6">
                  <Label htmlFor="form-option-1" className="font-medium">
                    Receive newsletter
                  </Label>
                  <p
                    id="form-option-1-description"
                    className="text-gray-500 dark:text-gray-500"
                  >
                    I want to receive updates from Company about relevant
                    products or services.
                  </p>
                </div>
              </div>
              <div className="relative flex items-start">
                <div className="flex h-6 items-center">
                  <Checkbox
                    id="form-option-2"
                    aria-describedby="form-option-2-description"
                    name="form-option-2"
                  />
                </div>
                <div className="ml-3 text-sm/6">
                  <Label htmlFor="form-option-2" className="font-medium">
                    Member activities
                  </Label>
                  <p
                    id="form-option-2-description"
                    className="text-gray-500 dark:text-gray-500"
                  >
                    Stay informed and receive notifications when new team
                    members join or leave this workspace.
                  </p>
                </div>
              </div>
              <div className="relative flex items-start">
                <div className="flex h-6 items-center">
                  <Checkbox
                    id="form-option-3"
                    aria-describedby="form-option-3-description"
                    name="form-option-3"
                  />
                </div>
                <div className="ml-3 text-sm/6">
                  <Label htmlFor="form-option-3" className="font-medium">
                    Deployment activities
                  </Label>
                  <p
                    id="form-option-3-description"
                    className="text-gray-500 dark:text-gray-500"
                  >
                    Receive notifications of successful or failed deployment of
                    this workspace. Read the{' '}
                    <a
                      href="#"
                      className="text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                    >
                      Workspace documentation
                    </a>{' '}
                    to learn more.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Divider />
          <div className="flex items-center justify-end space-x-4">
            <Button variant="secondary">Cancel</Button>
            <Button>Save settings</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
