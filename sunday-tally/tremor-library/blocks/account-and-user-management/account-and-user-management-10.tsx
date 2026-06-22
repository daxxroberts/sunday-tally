'use client';

import { RiDeleteBin4Fill } from '@remixicon/react';

import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { Input } from '@/components/Input';
import { Label } from '@/components/Label';

const members = [
  //array-start
  {
    id: 1,
    email: 'max@company.com',
    initials: 'MA',
  },
  {
    id: 2,
    email: 'john@company.com',
    initials: 'JO',
  },
  {
    id: 3,
    email: 'emma@company.com',
    initials: 'EM',
  },
  //array-end
];

export default function Example() {
  return (
    <div className="obfuscate">
      <div className="sm:mx-auto sm:max-w-2xl">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
          Create workspace
        </h1>
        <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
          Workspaces are shared environments where teams can connect to data
          sources, run queries and create reports.
        </p>
        <form action="#" method="POST" className="mt-8">
          <div className="space-y-6">
            <div>
              <Label htmlFor="workspace-name" className="font-medium">
                Name<span className="text-red-500 dark:text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="workspace-name"
                name="workspace-name"
                placeholder="My workspace"
                className="mt-2"
                required
              />
            </div>
            <div>
              <Label htmlFor="members" className="font-medium">
                Members
              </Label>
              <div className="mt-2 flex items-center space-x-2">
                <Input
                  type="email"
                  id="members"
                  name="members"
                  placeholder="Add member emails"
                />
                <Button className="text-base sm:text-sm">Add</Button>
              </div>
            </div>
          </div>
          <div className="mt-10">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-50">
              People added to workspace
            </h2>
            <ul
              role="list"
              className="mt-2 divide-y divide-gray-200 dark:divide-gray-800"
            >
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <div className="flex items-center space-x-4">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs uppercase text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                      aria-hidden="true"
                    >
                      {member.initials}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {member.email}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-500 hover:dark:text-gray-300"
                  >
                    <RiDeleteBin4Fill
                      className="size-5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Remove {member.email}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <Divider />
          <div className="flex items-center justify-end space-x-4">
            <Button variant="secondary">Cancel</Button>
            <Button type="submit">Create workspace</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
