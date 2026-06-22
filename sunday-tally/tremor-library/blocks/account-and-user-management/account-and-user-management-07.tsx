'use client';

import { Button } from '@/components/Button';
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs';

const data = [
  //array-start
  {
    name: 'Alissia Stone',
    initials: 'AS',
    email: 'a.stone@gmail.com',
    href: '#',
  },
  {
    name: 'Emma Bern',
    initials: 'EB',
    email: 'e.bern@gmail.com',
    href: '#',
  },
  {
    name: 'Aaron Wave',
    initials: 'AW',
    email: 'a.flow@acme.com',
    href: '#',
  },
  {
    name: 'Thomas Palstein',
    initials: 'TP',
    email: 't.palstein@acme.com',
    href: '#',
  },
  {
    name: 'Sarah Johnson',
    initials: 'SJ',
    email: 's.johnson@gmail.com',
    href: '#',
  },
  {
    name: 'Megan Brown',
    initials: 'MB',
    email: 'm.brown@gmail.com',
    href: '#',
  },
  //array-end
];

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
          <TabsTrigger value="tab2">Users</TabsTrigger>
          <TabsTrigger value="tab3">Billing</TabsTrigger>
        </TabsList>
        {/* Content below only for demo purpose placed outside of <Tab> component. Add <TabPanels>, <TabPanel> to make it functional and to add content for other tabs */}
        <div className="mt-6 sm:flex sm:items-start sm:justify-between sm:space-x-8">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-50">
              Users
            </h3>
            <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
              Workspace administrators can add, manage, and remove members.
            </p>
          </div>
          <Button className="mt-4 sm:mt-0">Add user</Button>
        </div>
        <ul
          role="list"
          className="mt-10 divide-y divide-gray-200 dark:divide-gray-800"
        >
          {data.map((member) => (
            <li
              key={member.name}
              className="flex items-center justify-between space-x-4 py-4"
            >
              <div className="flex items-center space-x-4 truncate">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                  aria-hidden="true"
                >
                  {member.initials}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    {member.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {member.email}
                  </p>
                </div>
              </div>
              <Button variant="secondary" asChild>
                <a href={member.href}>Edit</a>
              </Button>
            </li>
          ))}
        </ul>
      </Tabs>
    </div>
  );
}
