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
      <Tabs defaultValue="tab2" className="mt-8">
        <TabsList variant="line">
          <TabsTrigger value="tab1">Account details</TabsTrigger>
          <TabsTrigger value="tab2">Workspaces</TabsTrigger>
          <TabsTrigger value="tab3">Details</TabsTrigger>
        </TabsList>
        {/* Content below only for demo purpose placed outside of <Tab> component. Add <TabsContent> to make it functional and to add content for other tabs */}
        <form action="#" method="POST">
          <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-50">
            Workspace settings
          </h2>
          <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
            Optimize your workspace with customizable settings and advanced
            features
          </p>
          <div className="mt-8 space-y-6">
            <Card className="max-w-xl overflow-hidden !p-0">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-900 dark:bg-gray-900">
                <Label htmlFor="feature-1" className="font-medium">
                  Enable beta analytics features
                </Label>
              </div>
              <div className="flex items-start space-x-10 p-4">
                <p
                  id="feature-1-description"
                  className="text-sm/6 text-gray-500 dark:text-gray-500"
                >
                  Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed
                  diam nonumy eirmod tempor invidunt ut labore et dolore magna
                  aliquyam erat.{' '}
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                  >
                    Learn more
                    <RiExternalLinkLine className="size-4" aria-hidden="true" />
                  </a>
                </p>
                <Switch
                  name="feature-1"
                  id="feature-1"
                  aria-describedby="feature-1-description"
                />
              </div>
            </Card>
            <Card className="max-w-xl overflow-hidden !p-0">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-900 dark:bg-gray-900">
                <Label htmlFor="feature-2" className="font-medium">
                  Enable test mode
                </Label>
              </div>
              <div className="flex items-start space-x-10 p-4">
                <p
                  id="feature-2-description"
                  className="text-sm/6 text-gray-500 dark:text-gray-500"
                >
                  Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed
                  diam nonumy eirmod.{' '}
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                  >
                    Learn more
                    <RiExternalLinkLine className="size-4" aria-hidden="true" />
                  </a>
                </p>
                <Switch
                  name="feature-2"
                  id="feature-2"
                  aria-describedby="feature-2-description"
                />
              </div>
            </Card>
          </div>
          <Divider className="!my-10" />
          <div className="flex items-center justify-end space-x-4">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
            <Button type="button">Save settings</Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
