'use client';

import { RiDeleteBin7Line } from '@remixicon/react';

import { cx } from '@/lib/utils';

import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { Label } from '@/components/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs';

const existingUsers = [
  //array-start
  {
    name: 'Lena Stone',
    email: 'lena.stone@company.com',
    initials: 'LS',
    currentRole: 'Admin',
    color: 'bg-blue-500',
  },
  {
    name: 'John Miller',
    email: 'john.miller@company.com',
    initials: 'JM',
    currentRole: 'Guest',
    color: 'bg-fuchsia-500',
  },
  {
    name: 'Emma Crombie',
    email: 'emma.crombie@company.com',
    initials: 'EC',
    currentRole: 'Guest',
    color: 'bg-violet-500',
  },
  {
    name: 'Sarah Johnson',
    email: 'sarah.johnson@company.com',
    initials: 'SJ',
    currentRole: 'Member',
    color: 'bg-pink-500',
  },
  {
    name: 'Alex Carter',
    email: 'alex.carter@company.com',
    initials: 'AC',
    currentRole: 'Member',
    color: 'bg-indigo-500',
  },
  //array-end
];

const pendingUsers = [
  //array-start
  {
    name: 'Mike River',
    email: 'mike.river@company.com',
    initials: 'MR',
    color: 'bg-indigo-500',
  },
  {
    name: 'Aaron Hill',
    email: 'aaron.hill@company.com',
    initials: 'AH',
    color: 'bg-fuchsia-500',
  },
  //array-end
];

export default function Example() {
  return (
    <div className="obfuscate">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">
        General
      </h1>
      <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-500">
        Manage your personal details, workspace governance and notifications.
      </p>
      <Tabs defaultValue="tab2" className="mt-8">
        <TabsList variant="line">
          <TabsTrigger value="tab1">Account details</TabsTrigger>
          <TabsTrigger value="tab2">Users</TabsTrigger>
          <TabsTrigger value="tab3">Billing</TabsTrigger>
        </TabsList>
        {/* Content below only for demo purpose placed outside of <Tab> component. Add <TabPanels>, <TabPanel> to make it functional and to add content for other tabs */}
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-3">
          <div>
            <h2 className="font-medium text-gray-900 dark:text-gray-50">
              Members
            </h2>
            <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-500">
              Manage roles of existing members. As an admin, you can add, edit
              or delete users.
            </p>
            <Button className="mt-4">Invite member</Button>
          </div>
          <form action="#" method="post" className="lg:col-span-2">
            <ul
              role="list"
              className="divide-y divide-gray-200 dark:divide-gray-800"
            >
              {existingUsers.map((user) => (
                <li
                  key={user.name}
                  className="block py-3 md:flex md:items-center md:justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <span
                      className={cx(
                        user.color,
                        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs text-white dark:text-white',
                      )}
                      aria-hidden="true"
                    >
                      {user.initials}
                    </span>
                    <div>
                      <Label htmlFor={user.name} className="font-medium">
                        {user.name}
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center space-x-2 md:mt-0">
                    <Select name={user.name} defaultValue={user.currentRole}>
                      <SelectTrigger className="w-full md:w-44">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Guest">Guest</SelectItem>
                        <SelectItem value="Member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-500 hover:dark:text-gray-300"
                    >
                      <RiDeleteBin7Line
                        className="size-5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Remove {user.name}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </form>
        </div>
        <Divider />
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-3">
          <div>
            <h2 className="font-medium text-gray-900 dark:text-gray-50">
              Pending Invites
            </h2>
            <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-500">
              Invited users who haven't accepted their invitation yet.
            </p>
          </div>
          <form className="lg:col-span-2">
            <ul
              role="list"
              className="divide-y divide-gray-200 dark:divide-gray-800"
            >
              {pendingUsers.map((user) => (
                <li
                  key={user.name}
                  className="block py-3 md:flex md:items-center md:justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <span
                      className={cx(
                        user.color,
                        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs text-white dark:text-white',
                      )}
                      aria-hidden="true"
                    >
                      {user.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                        {user.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center space-x-2 md:mt-0">
                    <Button
                      variant="secondary"
                      className="w-full !text-blue-500 hover:!text-blue-600 dark:!text-blue-500 hover:dark:!text-blue-600 md:w-44"
                    >
                      Resend invite
                    </Button>
                    <Button variant="ghost">
                      <RiDeleteBin7Line
                        className="size-5 shrink-0 !text-gray-500 hover:!text-gray-700 dark:!text-gray-500 hover:dark:!text-gray-300"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </form>
        </div>
      </Tabs>
    </div>
  );
}
