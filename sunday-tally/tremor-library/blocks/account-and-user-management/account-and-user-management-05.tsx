'use client';

import { RiExternalLinkLine, RiInstanceLine } from '@remixicon/react';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Divider } from '@/components/Divider';
import { Input } from '@/components/Input';
import { Label } from '@/components/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';
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
          <TabsTrigger value="tab2">Settings</TabsTrigger>
          <TabsTrigger value="tab3">Billing</TabsTrigger>
        </TabsList>
        {/* Content below only for demo purpose placed outside of <Tab> component. Add <TabPanels>, <TabPanel> to make it functional and to add content for other tabs */}
        <form action="#" method="POST">
          <div className="mt-8 rounded-md bg-gray-50 p-6 ring-1 ring-inset ring-gray-200 dark:bg-gray-900 dark:ring-gray-800 sm:max-w-7xl">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              This workspace is currently on free plan
            </h2>
            <p className="mt-2 text-tremor-default text-tremor-content dark:text-dark-tremor-content">
              Boost your analytics and unlock advanced features with our premium
              plans.
            </p>
            <div className="mt-6 flex items-center space-x-2">
              <Button asChild>
                <a href="#">Compare Plans</a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="#">Dismiss</a>
              </Button>
            </div>
          </div>
          <div className="mt-6 space-y-8 sm:max-w-lg">
            <div>
              <Label htmlFor="name" className="font-semibold">
                Name
              </Label>
              <Input
                name="name"
                id="name"
                className="mt-2"
                disabled
                placeholder="sales-dashboard"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                Contact your admin to change workspace names in production.
              </p>
            </div>
            <div>
              <Label htmlFor="select-input-1" className="font-semibold">
                Default model
              </Label>
              <Select
                name="select-input-1"
                // id="select-input-1"
                defaultValue="1"
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <span className="flex items-center gap-2.5">
                      <RiInstanceLine
                        className="size-5 shrink-0 text-gray-500 dark:text-gray-500"
                        aria-hidden="true"
                      />
                      GPT-4o (OpenAI)
                    </span>
                  </SelectItem>
                  <SelectItem value="2">
                    <span className="flex items-center gap-2.5">
                      <RiInstanceLine
                        className="size-5 shrink-0 text-gray-500 dark:text-gray-500"
                        aria-hidden="true"
                      />
                      BERT (Google)
                    </span>
                  </SelectItem>
                  <SelectItem value="3">
                    <span className="flex items-center gap-2.5">
                      <RiInstanceLine
                        className="size-5 shrink-0 text-gray-500 dark:text-gray-500"
                        aria-hidden="true"
                      />
                      LLaMA (Meta)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="select-input-2" className="font-semibold">
                Training cycle
              </Label>
              <Select defaultValue="2">
                <SelectTrigger
                  name="select-input-2"
                  id="select-input-2"
                  className="mt-2"
                >
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Every 24 hours</SelectItem>
                  <SelectItem value="2">Once in a week</SelectItem>
                  <SelectItem value="3">Once in a month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Workspace governance
              </h3>
              <div className="mt-6 space-y-6">
                <div className="relative flex items-start">
                  <div className="flex h-6 items-center">
                    <Checkbox
                      id="checkbox-name-1"
                      aria-describedby="checkbox-name-1-description"
                      name="checkbox-name-1"
                    />
                  </div>
                  <div className="ml-3 text-sm/6">
                    <Label htmlFor="checkbox-name-1" className="font-medium">
                      Require team member approval for deploy requests
                    </Label>
                    <p
                      id="checkbox-name-1-description"
                      className="text-gray-500 dark:text-gray-500"
                    >
                      Lorem ipsum dolor sit amet, consetetur sadipscing elitr.
                    </p>
                  </div>
                </div>
                <div className="relative flex items-start">
                  <div className="flex h-6 items-center">
                    <Checkbox
                      id="checkbox-name-2"
                      aria-describedby="checkbox-name-2-description"
                      name="checkbox-name-2"
                    />
                  </div>
                  <div className="ml-3 text-sm/6">
                    <Label htmlFor="checkbox-name-2" className="font-medium">
                      Enable audit logs
                    </Label>
                    <p
                      id="checkbox-name-2-description"
                      className="text-gray-500 dark:text-gray-500"
                    >
                      Lorem ipsum dolor sit amet.
                    </p>
                  </div>
                </div>
                <div className="relative flex items-start">
                  <div className="flex h-6 items-center">
                    <Checkbox
                      id="checkbox-name-3"
                      aria-describedby="checkbox-name-3-description"
                      name="checkbox-name-3"
                    />
                  </div>
                  <div className="ml-3 text-sm/6">
                    <Label htmlFor="checkbox-name-3" className="font-medium">
                      Enable email notifications for model deployment activities
                    </Label>
                    <p
                      id="checkbox-name-3-description"
                      className="text-gray-500 dark:text-gray-500"
                    >
                      Labore et dolore magna aliquyam erat. Lorem ipsum dolor
                      sit amet, consetetur sadipscing elitr.{' '}
                      <a
                        href="#"
                        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                      >
                        Go to email settings
                        <RiExternalLinkLine
                          className="size-4"
                          aria-hidden="true"
                        />
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Divider className="!my-10" />
          <div className="flex items-center justify-end space-x-4">
            <Button variant="secondary">Cancel</Button>
            <Button>Save settings</Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
