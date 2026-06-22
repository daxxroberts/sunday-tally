'use client';

import { RiExternalLinkLine } from '@remixicon/react';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Label } from '@/components/Label';
import { Switch } from '@/components/Switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs';

export default function Example() {
  return (
    <div className="obfuscate">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">
        General
      </h1>
      <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
        Manage your personal details, workspace governance and notifications.
      </p>
      <Tabs defaultValue="tab3" className="mt-8">
        <TabsList variant="line">
          <TabsTrigger value="tab1">Account details</TabsTrigger>
          <TabsTrigger value="tab2">Users</TabsTrigger>
          <TabsTrigger value="tab3">Add-Ons</TabsTrigger>
        </TabsList>
        {/* Content below only for demo purpose placed outside of <Tab> component. Add <TabPanels>, <TabPanel> to make it functional and to add content for other tabs */}
        <div className="max-w-3xl">
          <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-50">
            Upgrade options
          </h2>
          <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
            Do more with your data and unlock new insights with our advanced
            features and add-ons.
          </p>
          <Divider className="!my-10" />
          <form action="#" method="POST">
            <Card className="!p-0">
              <div className="p-6">
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  $25/month
                </p>
                <h3 className="mt-4 font-semibold text-gray-900 dark:text-gray-50">
                  Query Caching
                </h3>
                <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
                  Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed
                  diam nonumy eirmod tempor invidunt ut labore et dolore magna
                  aliquyam erat.
                </p>
                <Divider />
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Switch id="option-1" name="option-1" />
                    <Label
                      htmlFor="option-1"
                      className="text-gray-500 dark:text-gray-500"
                    >
                      Activate <span className="sr-only">Query Caching</span>
                    </Label>
                  </div>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                  >
                    Learn more
                    <RiExternalLinkLine className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
              <Divider className="!my-0" />
              <div className="p-6">
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  $100/month
                </p>
                <h3 className="mt-4 font-semibold text-gray-900 dark:text-gray-50">
                  Advanced Bot Protection
                </h3>
                <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
                  Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed
                  diam nonumy eirmod tempor invidunt ut labore et dolore magna
                  aliquyam erat.
                </p>
                <Divider />
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Switch id="option-2" name="option-2" />
                    <Label htmlFor="option-2">
                      Activate{' '}
                      <span className="sr-only">Advanced Bot Protection</span>
                    </Label>
                  </div>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                  >
                    Learn more
                    <RiExternalLinkLine className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
              <Divider className="!my-0" />
              <div className="p-6">
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  $90/month
                </p>
                <h3 className="mt-4 font-semibold text-gray-900 dark:text-gray-50">
                  Observability Analytics
                </h3>
                <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
                  Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed
                  diam nonumy eirmod tempor invidunt ut labore et dolore magna
                  aliquyam erat.
                </p>
                <Divider />
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Switch id="option-3" name="option-3" />
                    <Label htmlFor="option-3">
                      Activate{' '}
                      <span className="sr-only">Observability Analytics</span>
                    </Label>
                  </div>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                  >
                    Learn more
                    <RiExternalLinkLine className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </Card>
            <Divider />
            <div className="flex justify-end">
              <Button type="submit">Upgrade plan</Button>
            </div>
          </form>
        </div>
      </Tabs>
    </div>
  );
}
