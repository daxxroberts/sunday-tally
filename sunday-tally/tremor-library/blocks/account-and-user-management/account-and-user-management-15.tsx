'use client';

import {
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiLink,
} from '@remixicon/react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/Accordion';

interface Progress {
  current: number;
  total: number;
}

interface AuditDate {
  date: string;
  auditor: string;
}

interface Document {
  name: string;
  status: 'OK' | 'Needs update' | 'In audit';
}

interface Section {
  id: string;
  title: string;
  certified: string;
  progress: Progress;
  status: 'complete' | 'warning';
  auditDates: AuditDate[];
  documents: Document[];
}

export const sections: Section[] = [
  {
    id: 'item-1',
    title: 'CompTIA Security+',
    certified: 'ISO',
    progress: { current: 46, total: 46 },
    status: 'complete',
    auditDates: [
      { date: 'Dec 10, 2023', auditor: 'Max Duster' },
      { date: 'Dec 12, 2023', auditor: 'Emma Stone' },
    ],
    documents: [
      { name: 'policy_overview.xlsx', status: 'OK' },
      { name: 'employee_guidelines.xlsx', status: 'Needs update' },
      { name: 'compliance_checklist.xlsx', status: 'In audit' },
    ],
  },
  {
    id: 'item-2',
    title: 'SAFe Certifications',
    certified: 'IEC 2701',
    progress: { current: 32, total: 41 },
    status: 'warning',
    auditDates: [
      { date: 'Jan 15, 2024', auditor: 'Sarah Johnson' },
      { date: 'Jan 20, 2024', auditor: 'Mike Peters' },
    ],
    documents: [
      { name: 'certification_records.xlsx', status: 'OK' },
      { name: 'training_logs.xlsx', status: 'In audit' },
      { name: 'assessment_results.xlsx', status: 'Needs update' },
    ],
  },
  {
    id: 'item-3',
    title: 'PMP Certifications',
    certified: 'ISO',
    progress: { current: 21, total: 21 },
    status: 'complete',
    auditDates: [
      { date: 'Feb 5, 2024', auditor: 'Lisa Chen' },
      { date: 'Feb 8, 2024', auditor: 'Tom Wilson' },
    ],
    documents: [
      { name: 'project_documents.xlsx', status: 'OK' },
      { name: 'methodology_guide.xlsx', status: 'OK' },
      { name: 'best_practices.xlsx', status: 'In audit' },
    ],
  },
  {
    id: 'item-4',
    title: 'Cloud Certifications',
    certified: 'SOC 2',
    progress: { current: 21, total: 21 },
    status: 'complete',
    auditDates: [
      { date: 'Mar 1, 2024', auditor: 'Alex Kumar' },
      { date: 'Mar 5, 2024', auditor: 'Rachel Green' },
    ],
    documents: [
      { name: 'aws_certifications.xlsx', status: 'OK' },
      { name: 'azure_competencies.xlsx', status: 'OK' },
      { name: 'gcp_credentials.xlsx', status: 'In audit' },
      { name: 'cloud_security.xlsx', status: 'OK' },
    ],
  },
];

const getStatusIcon = (status: string) => {
  if (status === 'complete') {
    return (
      <RiCheckboxCircleFill className="size-[18px] shrink-0 text-emerald-600 dark:text-emerald-400" />
    );
  }
  return (
    <RiErrorWarningFill className="size-[18px] shrink-0 text-red-600 dark:text-red-400" />
  );
};

export default function Audits() {
  return (
    <div className="obfuscate">
      <Accordion type="multiple" className="mt-3">
        {sections.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger className="py-5">
              <p className="flex w-full items-center justify-between pr-4">
                <span className="flex items-center gap-2.5">
                  <span>{section.title}</span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-400/10 dark:text-gray-300">
                    {section.certified}
                  </span>
                </span>
                <span className="flex items-center gap-x-2 tabular-nums">
                  {getStatusIcon(section.status)}
                  {section.progress.current}/{section.progress.total}
                </span>
              </p>
            </AccordionTrigger>
            <AccordionContent>
              <div className="mt-2 grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <p className="flex items-center justify-between text-sm font-medium text-gray-900 dark:text-gray-50">
                    <span>Audit round</span>
                    <span>Auditor</span>
                  </p>
                  <ul className="mt-1 divide-y divide-gray-200 text-sm text-gray-600 dark:divide-gray-800 dark:text-gray-400">
                    {section.auditDates.map((audit, index) => (
                      <li
                        key={index}
                        className="flex items-center justify-between py-2.5"
                      >
                        <span>{audit.date}</span>
                        <span>{audit.auditor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="flex items-center justify-between text-sm font-medium text-gray-900 dark:text-gray-50">
                    <span>Related documents</span>
                    <span>Status</span>
                  </p>
                  <ul className="mt-1 divide-y divide-gray-200 text-gray-600 dark:divide-gray-800 dark:text-gray-400">
                    {section.documents.map((doc, index) => (
                      <li
                        key={index}
                        className="flex items-center justify-between py-2.5 text-sm"
                      >
                        <a
                          href="#"
                          className="flex items-center gap-2 text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                        >
                          <RiLink
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {doc.name}
                        </a>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="hover:text-gray-900 hover:underline hover:underline-offset-4 hover:dark:text-gray-50"
                          >
                            Edit
                          </button>
                          <span
                            className="h-4 w-px bg-gray-300 dark:bg-gray-700"
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            className="hover:text-gray-900 hover:underline hover:underline-offset-4 hover:dark:text-gray-50"
                          >
                            Re-Upload
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
