// core/services/language.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppLang = 'en' | 'ar';

const ARABIC_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap';

// ── Translation map ──────────────────────────────────────────────────────────
// Add keys here as the app grows. Every component calls label() from this map.
export const TRANSLATIONS: Record<AppLang, Record<string, string>> = {
  en: {
    // account / me page
    loading:           'Loading account…',
    profile:           'Profile',
    security:          'Security',
    prefs:             'Preferences',
    danger:            'Danger zone',
    refresh:           'Refresh',
    logout:            'Logout',
    profileSub:        'Account details and photo',
    securitySub:       'Change your password',
    prefsSub:          'Personal settings',
    dangerSub:         'Permanent actions',
    language:          'Language',
    langHint:          'Switches the interface to Arabic (RTL).',
    emailNotif:        'Email notifications',
    weeklySummary:     'Weekly summary',
    moreOptionsSoon:   'More options coming soon.',
    displayName:       'Display name',
    optional:          'Optional',
    save:              'Save',
    saving:            'Saving…',
    currentPassword:   'Current password',
    newPassword:       'New password',
    newPasswordHint:   'Minimum 6 characters.',
    updatePassword:    'Update password',
    updatingPassword:  'Updating…',
    changePhoto:       'Change photo',
    photoHint:         'JPG / PNG / WEBP · up to 5 MB',
    cropPhoto:         'Crop photo',
    cropHint:          'Drag to reposition · adjust zoom',
    zoom:              'Zoom',
    savePhoto:         'Save photo',
    uploading:         'Uploading…',
    cancel:            'Cancel',
    close:             'Close',
    deleteAccount:     'Delete account',
    deleteDesc:        'This permanently deletes your account and all content. This cannot be undone.',
    confirmPassword:   'Confirm password',
    confirmPasswordHint: 'Required to confirm account deletion.',
    deleting:          'Deleting…',
    hide:              'Hide',
    show:              'Show',
    status:            'Status',
    active:            'Active',
    userId:            'User ID',
    language_label:    'Language',
    roles:             'Roles',
    email:             'Email',
    phone:             'Phone',
    soon:              'Soon',
    notSet:            'Not set',
    settingsLabel:     'Settings',
    signInAgain:       "You'll sign in again after changing.",

    // nav / shared
    home:              'Home',
    academies:         'Academies',
    courses:           'Courses',
    students:          'Students',
    instructors:       'Instructors',
    dashboard:         'Dashboard',
    myLearning:        'My Learning',
    account:           'Account',
    createAccount:     'Create account',
    signIn:            'Sign in',
    back:              'Back',
    next:              'Next',
    create:            'Create',
    edit:              'Edit',
    delete:            'Delete',
    confirm:           'Confirm',
    yes:               'Yes',
    no:                'No',

    // org panel
    orgPanel:          'Organization panel',
    yourAcademies:     'Your Academies',
    academiesDesc:     'Create, publish, and manage your organization\'s academies.',
    newAcademy:        '+ New Academy',
    total:             'Total',
    allAcademies:      'All academies',
    published:         'Published',
    visibleStudents:   'Visible to students',
    draft:             'Draft',
    notYetPublished:   'Not yet published',
    hidden:            'Hidden',
    requiresReview:    'Requires review',
    noAcademiesYet:    'No academies yet',
    noAcademiesDesc:   'Create your first academy, then share the instructor registration link with your team.',
    createAcademy:     '+ Create Academy',
    instructorLink:    'Instructor link',
    copy:              'Copy',
    copied:            '✓ Copied!',
    deleteAcademy:     'Delete',
    deletingAcademy:   'Deleting…',

    // edit academy
    editAcademy:       'Edit Academy',
    editAcademyDesc:   'Update academy details, branding, banner, logo, and publishing identity.',
    brandAssets:       'Brand assets',
    brandAssetsDesc:   'Manage how your academy appears across the platform.',
    academyDetails:    'Academy details',
    academyDetailsDesc:'Control the name, URL, color, and typography style.',
    academyInfo:       'Academy info',
    saveChanges:       'Save changes',
    logo:              'Logo',
    logoSub:           'Square brand mark for cards and headers.',
    banner:            'Banner',
    bannerSub:         'Wide cover image for a premium academy look.',
    uploadLogo:        'Upload logo',
    uploadBanner:      'Upload banner',
    academyName:       'Academy name',
    slug:              'Slug',
    generate:          'Generate',
    primaryColor:      'Primary color',
    fontStyle:         'Font style',
    website:           'Website',
    description:       'Description',
    members:           'Members',
    payouts:           'Payouts',
    payoutSettings:    'Payout Settings',
    notifications:     'Notifications',
    markAllRead:       'Mark all read',
    noNotificationsYet:'No notifications yet.',
    revenue:           'Revenue',
    earnings:          'Earnings',
    explore:           'Explore',
    myAcademy:         'My Academy',
    adminPanel:        'Admin Panel',
    student:           'Student',
    instructor:        'Instructor',
    organization:      'Organization',
    user:              'User',
    purchases:         'Purchases',
  },

  ar: {
    // account / me page
    loading:           'جارٍ تحميل الحساب…',
    profile:           'الملف الشخصي',
    security:          'الأمان',
    prefs:             'التفضيلات',
    danger:            'منطقة الخطر',
    refresh:           'تحديث',
    logout:            'تسجيل الخروج',
    profileSub:        'تفاصيل الحساب والصورة',
    securitySub:       'تغيير كلمة المرور',
    prefsSub:          'الإعدادات الشخصية',
    dangerSub:         'إجراءات دائمة',
    language:          'اللغة',
    langHint:          'يُبدّل الواجهة إلى العربية (RTL).',
    emailNotif:        'إشعارات البريد الإلكتروني',
    weeklySummary:     'ملخص أسبوعي',
    moreOptionsSoon:   'المزيد من الخيارات قريبًا.',
    displayName:       'الاسم المعروض',
    optional:          'اختياري',
    save:              'حفظ',
    saving:            'جارٍ الحفظ…',
    currentPassword:   'كلمة المرور الحالية',
    newPassword:       'كلمة المرور الجديدة',
    newPasswordHint:   'لا يقل عن 6 أحرف.',
    updatePassword:    'تحديث كلمة المرور',
    updatingPassword:  'جارٍ التحديث…',
    changePhoto:       'تغيير الصورة',
    photoHint:         'JPG / PNG / WEBP · حتى 5 ميجابايت',
    cropPhoto:         'قص الصورة',
    cropHint:          'اسحب لإعادة التموضع · اضبط التكبير',
    zoom:              'تكبير',
    savePhoto:         'حفظ الصورة',
    uploading:         'جارٍ الرفع…',
    cancel:            'إلغاء',
    close:             'إغلاق',
    deleteAccount:     'حذف الحساب',
    deleteDesc:        'سيؤدي هذا إلى حذف حسابك وجميع المحتوى بشكل دائم. لا يمكن التراجع عن هذا.',
    confirmPassword:   'تأكيد كلمة المرور',
    confirmPasswordHint: 'مطلوبة لتأكيد حذف الحساب.',
    deleting:          'جارٍ الحذف…',
    hide:              'إخفاء',
    show:              'إظهار',
    status:            'الحالة',
    active:            'نشط',
    userId:            'معرّف المستخدم',
    language_label:    'اللغة',
    roles:             'الأدوار',
    email:             'البريد الإلكتروني',
    phone:             'الهاتف',
    soon:              'قريبًا',
    notSet:            'غير محدد',
    settingsLabel:     'الإعدادات',
    signInAgain:       'ستسجّل الدخول مجددًا بعد التغيير.',

    // nav / shared
    home:              'الرئيسية',
    academies:         'الأكاديميات',
    courses:           'الدورات',
    students:          'الطلاب',
    instructors:       'المدربون',
    dashboard:         'لوحة التحكم',
    myLearning:        'تعلّمي',
    account:           'الحساب',
    createAccount:     'إنشاء حساب',
    signIn:            'تسجيل الدخول',
    back:              'رجوع',
    next:              'التالي',
    create:            'إنشاء',
    edit:              'تعديل',
    delete:            'حذف',
    confirm:           'تأكيد',
    yes:               'نعم',
    no:                'لا',

    // org panel
    orgPanel:          'لوحة المنظمة',
    yourAcademies:     'أكاديمياتك',
    academiesDesc:     'أنشئ وانشر وأدر أكاديميات مؤسستك.',
    newAcademy:        '+ أكاديمية جديدة',
    total:             'الإجمالي',
    allAcademies:      'جميع الأكاديميات',
    published:         'منشورة',
    visibleStudents:   'مرئية للطلاب',
    draft:             'مسودة',
    notYetPublished:   'لم تُنشر بعد',
    hidden:            'مخفية',
    requiresReview:    'تحتاج مراجعة',
    noAcademiesYet:    'لا توجد أكاديميات بعد',
    noAcademiesDesc:   'أنشئ أكاديميتك الأولى، ثم شارك رابط تسجيل المدرب مع فريقك.',
    createAcademy:     '+ إنشاء أكاديمية',
    instructorLink:    'رابط المدرب',
    copy:              'نسخ',
    copied:            '✓ تم النسخ!',
    deleteAcademy:     'حذف',
    deletingAcademy:   'جارٍ الحذف…',

    // edit academy
    editAcademy:       'تعديل الأكاديمية',
    editAcademyDesc:   'تحديث تفاصيل الأكاديمية والعلامة التجارية والصور.',
    brandAssets:       'أصول العلامة التجارية',
    brandAssetsDesc:   'إدارة كيفية ظهور أكاديميتك عبر المنصة.',
    academyDetails:    'تفاصيل الأكاديمية',
    academyDetailsDesc:'تحكم في الاسم والرابط واللون والخط.',
    academyInfo:       'معلومات الأكاديمية',
    saveChanges:       'حفظ التغييرات',
    logo:              'الشعار',
    logoSub:           'علامة مربعة للبطاقات والرؤوس.',
    banner:            'البانر',
    bannerSub:         'صورة غلاف عريضة لمظهر أكاديمي احترافي.',
    uploadLogo:        'رفع الشعار',
    uploadBanner:      'رفع البانر',
    academyName:       'اسم الأكاديمية',
    slug:              'المعرّف',
    generate:          'توليد',
    primaryColor:      'اللون الأساسي',
    fontStyle:         'نمط الخط',
    website:           'الموقع الإلكتروني',
    description:       'الوصف',

    members:           'الأعضاء',
    payouts:           'الدفعات',
    payoutSettings:    'إعدادات الدفعات',
    notifications:     'الإشعارات',
    markAllRead:       'تحديد الكل كمقروء',
    noNotificationsYet:'لا توجد إشعارات بعد.',
    revenue:           'الإيرادات',
    earnings:          'الأرباح',
    explore:           'استكشاف',
    myAcademy:         'أكاديميتي',
    adminPanel:        'لوحة الإدارة',
    student:           'طالب',
    instructor:        'مدرب',
    organization:      'المنظمة',
    user:              'مستخدم',
    purchases:         'المشتريات',
  },
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private _lang: AppLang;
  private arabicFontInjected = false;

  /** Reactive stream — subscribe in components to re-render on change */
  readonly lang$ = new BehaviorSubject<AppLang>(
    (localStorage.getItem('alef_lang') as AppLang) || 'en'
  );

  constructor() {
    this._lang = this.lang$.value;
    this._applyToDocument(this._lang);
  }

  get current(): AppLang { return this._lang; }
  get isRtl(): boolean   { return this._lang === 'ar'; }

  /** Translate a key for the current language */
  label(key: string): string {
    return TRANSLATIONS[this._lang]?.[key]
      ?? TRANSLATIONS['en'][key]
      ?? key;
  }

  /** Change language — persists to localStorage, updates document, emits to all subscribers */
  set(lang: AppLang): void {
    this._lang = lang;
    localStorage.setItem('alef_lang', lang);
    this._applyToDocument(lang);
    this.lang$.next(lang);
  }

  private _applyToDocument(lang: AppLang): void {
    const isRtl = lang === 'ar';

    document.documentElement.lang = lang;
    document.documentElement.dir  = isRtl ? 'rtl' : 'ltr';
    document.body.dir              = isRtl ? 'rtl' : 'ltr';

    // Toggle a global CSS class for app-wide RTL styles
    document.body.classList.toggle('lang-ar', isRtl);
    document.body.classList.toggle('lang-en', !isRtl);

    // Lazy-load Arabic font only when first needed
    if (isRtl && !this.arabicFontInjected) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = ARABIC_FONT_URL;
      document.head.appendChild(link);
      this.arabicFontInjected = true;
    }
  }
}