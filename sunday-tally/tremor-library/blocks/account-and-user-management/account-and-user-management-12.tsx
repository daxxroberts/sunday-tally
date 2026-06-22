'use client';

import { RiDeleteBin4Fill } from '@remixicon/react';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';

const existingMembers = [
  //array-start
  {
    name: 'Max Miller',
    email: 'max@company.com',
    initials: 'MM',
    status: 'member',
  },
  {
    name: 'Lena Wave',
    email: 'lena@company.com',
    initials: 'LW',
    status: 'member',
  },
  {
    name: 'Emma Ross',
    email: 'emma@company.com',
    initials: 'ER',
    status: 'member',
  },
  //array-end
];

const invitedMembers = [
  //array-start
  {
    name: 'Tom Crown',
    email: 'tom@company.com',
    initials: 'TC',
  },
  {
    name: 'John Doe',
    email: 'john@company.com',
    initials: 'JD',
  },
  {
    name: 'Michael Crombie',
    email: 'michael@company.com',
    initials: 'MC',
  },
  //array-end
];

const options = [
  //array-start
  {
    name: 'Guest',
    value: '1',
  },
  {
    name: 'Member',
    value: '2',
  },
  {
    name: 'Admin',
    value: '3',
  },
  //array-end
];

export default function Example() {
  return (
    <div className="obfuscate">
      <div className="sm:mx-auto sm:max-w-2xl">
        <h1 className="font-semibold text-gray-900 dark:text-gray-50">
          Invite members
        </h1>
        <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
          Add new team members to your workspace. Please consider your
          organization's policies when adding external people.
        </p>
        <form className="mt-6 sm:flex sm:items-center sm:space-x-2">
          <Select defaultValue="1">
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {options.map((item) => (
                <SelectItem key={item.name} value={item.value}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 flex w-full items-center space-x-2 sm:mt-0">
            <Input id="inviteEmail" placeholder="Add email..." type="email" />
            <Button className="text-base sm:text-sm">Invite</Button>
          </div>
        </form>
        <h2 className="mt-6 text-sm font-medium text-gray-900 dark:text-gray-50">
          People with existing access
        </h2>
        <ul
          role="list"
          className="mt-2 divide-y divide-gray-200 dark:divide-gray-800"
        >
          {existingMembers.map((member) => (
            <li
              key={member.name}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <div className="flex items-center space-x-4">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-400 text-xs text-white dark:bg-gray-600 dark:text-white"
                  aria-hidden="true"
                >
                  {member.initials}
                </span>
                <span className="text-gray-700 dark:text-gray-300">
                  {member.name}
                </span>
              </div>
              <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                {member.status}
              </span>
            </li>
          ))}
        </ul>

        {/* note to user: list that can be shown when users have been invited */}
        <h2 className="mt-6 text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
          More people with access
        </h2>
        <ul
          role="list"
          className="mt-2 divide-y divide-gray-200 dark:divide-gray-800"
        >
          {invitedMembers.map((member) => (
            <li
              key={member.name}
              className="flex items-center justify-between space-x-4 py-2.5 text-sm"
            >
              <div className="flex items-center space-x-4 truncate">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-xs uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-500"
                  aria-hidden="true"
                >
                  {member.initials}
                </span>
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {member.email}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center whitespace-nowrap rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  Pending invitation
                </span>

                <Button
                  variant="ghost"
                  className="p-2 !text-gray-500 hover:!bg-red-50 hover:!text-red-500 dark:!text-gray-500 hover:dark:!text-gray-300"
                >
                  <RiDeleteBin4Fill
                    className="size-5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Remove {member.email}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
