/**
 * Lab Portal - OpenELIS-inspired redesign
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Plus, Edit, User, AlertTriangle, FlaskConical,
  FileBarChart, Upload, ClipboardList, GitBranch, BarChart2,
  BookOpen, Bell, ScrollText, TrendingUp, LogOut, ChevronDown, ChevronRight,
} from 'lucide-react';

import styles from './LabPortal.module.css';
import { DashboardTab } from './DashboardTab';
import { AddSampleTab } from './AddSampleTab';
import { EditSampleTab } from './EditSampleTab';
import { PatientsTab } from './PatientsTab';
import { NonConformityTab } from './NonConformityTab';
import { ResultsTab } from './ResultsTab';
import { ReportsTab } from './ReportsTab';
import { UploadTab } from './UploadTab';
import { OrdersTab } from './OrdersTab';
import { WorkflowTab } from './WorkflowTab';
import { AnalyticsTab } from './AnalyticsTab';
import { CatalogTab } from './CatalogTab';
import { NotificationsTab } from './NotificationsTab';
import { AuditTrailTab } from './AuditTrailTab';
import { TrendsTab } from './TrendsTab';

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` };
  const res = await fetch(url, { headers, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function LabPortal() {
  const labId = localStorage.getItem('lab_id');
  const userEmail = localStorage.getItem('user_email') || 'Lab Staff';
  const labRole = localStorage.getItem('lab_role') || 'LAB_STAFF';
  const userInitial = (userEmail[0] || 'L').toUpperCase();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [facilityName, setFacilityName] = useState('Loading...');
  const [addSamplePatient, setAddSamplePatient] = useState(null);
  const [expandedMenus, setExpandedMenus] = useState({ reports: false, analytics: false });

  const toggleMenu = (id) => setExpandedMenus(p => ({ ...p, [id]: !p[id] }));

  const goToAddSample = (patient) => {
    setAddSamplePatient(patient);
    setActiveTab('add-sample');
  };

  useEffect(() => {
    apiFetch('/api/v1/labs/status')
      .then((d) => setFacilityName(d.laboratory?.facility_name || 'Infer Lab'))
      .catch(() => setFacilityName('Infer Lab'));
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/lab/login';
  };

  const REPORTS_SUB = [
    { id: 'report:test-status',         label: 'Test Status by Patient' },
    { id: 'report:all-tests-summary',   label: 'All Tests Summary'      },
    { id: 'report:nonconformity-date',  label: 'NC by Date'             },
    { id: 'report:nonconformity-section', label: 'NC by Section'        },
    { id: 'report:audit-trail',         label: 'Audit Trail'            },
  ];

  const ANALYTICS_SUB = [
    { id: 'analytics:overview',     label: 'Overview'          },
    { id: 'analytics:tat',          label: 'TAT Analysis'      },
    { id: 'analytics:volume',       label: 'Test Volume'       },
    { id: 'analytics:revenue',      label: 'Revenue'           },
    { id: 'analytics:clinical',     label: 'Clinical Insights' },
    { id: 'analytics:demographics', label: 'Demographics'      },
    { id: 'analytics:quality',      label: 'Quality (NC+QC)'   },
    { id: 'analytics:staff',        label: 'Staff Performance' },
    { id: 'analytics:instruments',  label: 'Instruments'       },
    { id: 'analytics:reports',      label: 'Custom Reports'    },
  ];

  const navItems = [
    { id: 'dashboard',      label: 'Lab Dashboard',  icon: <LayoutDashboard size={16} /> },
    { id: 'add-sample',     label: 'Add Sample',     icon: <Plus size={16} /> },
    { id: 'edit-sample',    label: 'Edit Sample',    icon: <Edit size={16} /> },
    { id: 'patient',        label: 'Patient',        icon: <User size={16} /> },
    { id: 'non-conformity', label: 'Non Conformity', icon: <AlertTriangle size={16} /> },
    { id: 'results',        label: 'Results',        icon: <FlaskConical size={16} /> },
    { id: 'reports',        label: 'Reports',        icon: <FileBarChart size={16} />, sub: REPORTS_SUB },
    { id: 'upload',         label: 'Upload',         icon: <Upload size={16} /> },
    { id: 'orders',         label: 'Orders',         icon: <ClipboardList size={16} /> },
    { id: 'workflow',       label: 'Workflow',       icon: <GitBranch size={16} /> },
    { id: 'analytics',      label: 'Analytics',      icon: <BarChart2 size={16} />, sub: ANALYTICS_SUB },
    { id: 'catalog',        label: 'Test Catalog',   icon: <BookOpen size={16} /> },
    { id: 'notifications',  label: 'Notifications',  icon: <Bell size={16} /> },
    { id: 'audit',          label: 'Audit Trail',    icon: <ScrollText size={16} /> },
    { id: 'trends',         label: 'Trend Analysis', icon: <TrendingUp size={16} /> },
  ];

  // activeTab can be 'reports', 'analytics', 'report:xxx', or 'analytics:xxx'
  const baseTab = activeTab.includes(':') ? activeTab.split(':')[0] : activeTab;
  const subSection = activeTab.includes(':') ? activeTab.split(':')[1] : null;
  const currentNavItem = navItems.find((n) => n.id === baseTab) || navItems[0];

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.sidebarLogoIcon}><FlaskConical size={20} /></div>
          <div>
            <div className={styles.sidebarLogoName}>Infer Lab</div>
            <div className={styles.sidebarLogoSub}>{facilityName}</div>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => {
            const isParentActive = baseTab === item.id;
            const isExpanded = expandedMenus[item.id];

            if (item.sub) {
              return (
                <div key={item.id}>
                  {/* Parent button — toggles submenu */}
                  <button
                    className={`${styles.navItem} ${isParentActive ? styles.active : ''}`}
                    onClick={() => {
                      toggleMenu(item.id);
                      // If no sub-section active yet, default to first sub
                      if (!isParentActive) {
                        setActiveTab(`${item.id}:${item.sub[0].id.split(':')[1]}`);
                      }
                    }}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      {item.label}
                    </span>
                    {isExpanded || isParentActive
                      ? <ChevronDown size={12} style={{ flexShrink: 0 }} />
                      : <ChevronRight size={12} style={{ flexShrink: 0 }} />}
                  </button>

                  {/* Sub-items */}
                  {(isExpanded || isParentActive) && (
                    <div style={{ background: 'rgba(0,0,0,0.15)', borderLeft: '2px solid rgba(255,255,255,0.1)', marginLeft: 16 }}>
                      {item.sub.map(sub => {
                        const subId = sub.id.includes(':') ? sub.id.split(':')[1] : sub.id;
                        const isSubActive = activeTab === `${item.id}:${subId}`;
                        return (
                          <button
                            key={sub.id}
                            className={`${styles.navItem} ${isSubActive ? styles.active : ''}`}
                            style={{ fontSize: 12, paddingLeft: 16, paddingTop: 7, paddingBottom: 7 }}
                            onClick={() => setActiveTab(`${item.id}:${subId}`)}
                          >
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: isSubActive ? 'white' : 'rgba(255,255,255,0.4)', display: 'inline-block', flexShrink: 0 }} />
                            {sub.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className={styles.sidebarBottom}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div>
            <div className={styles.topbarTitle}>{currentNavItem.label}</div>
            <div className={styles.topbarFacility}>{facilityName}</div>
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.userChip}>
              <div className={styles.userAvatar}>{userInitial}</div>
              <span>{userEmail}</span>
              <span className={styles.roleBadge}>{labRole}</span>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <main className={styles.content}>
          {baseTab === 'dashboard'      && <DashboardTab labId={labId} styles={styles} />}
          {baseTab === 'add-sample'     && <AddSampleTab labId={labId} styles={styles} prefillPatient={addSamplePatient} onPrefillUsed={() => setAddSamplePatient(null)} />}
          {baseTab === 'edit-sample'    && <EditSampleTab labId={labId} styles={styles} />}
          {baseTab === 'patient'        && <PatientsTab labId={labId} styles={styles} onAddSample={goToAddSample} />}
          {baseTab === 'non-conformity' && <NonConformityTab labId={labId} styles={styles} />}
          {baseTab === 'results'        && <ResultsTab labId={labId} styles={styles} />}
          {baseTab === 'reports'        && <ReportsTab labId={labId} styles={styles} activeReport={subSection} />}
          {baseTab === 'upload'         && <UploadTab labId={labId} styles={styles} />}
          {baseTab === 'orders'         && <OrdersTab labId={labId} styles={styles} />}
          {baseTab === 'workflow'       && <WorkflowTab labId={labId} styles={styles} />}
          {baseTab === 'analytics'      && <AnalyticsTab labId={labId} styles={styles} activeSection={subSection} />}
          {activeTab === 'catalog'        && <CatalogTab labId={labId} styles={styles} />}
          {activeTab === 'notifications'  && <NotificationsTab labId={labId} styles={styles} />}
          {activeTab === 'audit'          && <AuditTrailTab labId={labId} styles={styles} />}
          {activeTab === 'trends'         && <TrendsTab labId={labId} styles={styles} />}
        </main>
      </div>
    </div>
  );
}

export default LabPortal;
