import { useId, type SVGProps } from 'react'
import {
  classroomCoverPatternKey,
  type ClassroomCoverPatternKey,
} from '@/lib/classroom-cover-patterns'

type ClassroomCoverPatternPlacement = 'center' | 'end'

interface Props extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  patternKey?: unknown
  /** Align the triangular artwork with the right edge of a room cover. */
  placement?: ClassroomCoverPatternPlacement
}

/**
 * Original KorKru cover artwork built from one theme colour.
 *
 * A diagonal from the top-left to the bottom-right divides every cover. The
 * artwork lives in the upper-right half, leaving the lower-left quiet for room
 * names and supporting copy. Filled shapes use currentColor at different
 * opacities, so the composition follows every room colour and light/dark mode.
 */
export function ClassroomCoverPattern({ patternKey, placement = 'center', ...props }: Props) {
  const key = classroomCoverPatternKey(patternKey)
  const clipId = `korkru-cover-${useId().replaceAll(':', '')}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 112"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio={placement === 'end' ? 'xMaxYMin meet' : 'xMidYMid meet'}
      {...props}
      data-classroom-cover-pattern={key}
      data-classroom-cover-placement={placement}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M0 0h320v112Z" fill="currentColor" stroke="none" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g data-classroom-cover-field="upper-right">
          <path d="M0 0h320v112Z" fill="currentColor" stroke="none" opacity=".045" />
          <path d="M142 0h178v112L260 91Z" fill="currentColor" stroke="none" opacity=".055" />
          <path d="M236 0h84v61l-25-9Z" fill="currentColor" stroke="none" opacity=".055" />
        </g>
        <g data-classroom-cover-motif={key}>
          {patternFor(key)}
        </g>
      </g>
    </svg>
  )
}

function patternFor(key: ClassroomCoverPatternKey) {
  switch (key) {
    case 'physics':
      return (
        <>
          <path
            d="M160 55c29-2 42-31 72-32 26-1 38 20 64 9-17 22-40 2-63 4-27 2-39 27-73 28Z"
            fill="currentColor"
            stroke="none"
            opacity=".2"
          />
          <rect x="252" y="13" width="48" height="7" rx="3.5" fill="currentColor" stroke="none" opacity=".3" />
          <path d="m277 20-14 38" strokeWidth="3.5" opacity=".72" />
          <circle cx="260" cy="66" r="11" fill="currentColor" stroke="none" opacity=".88" />
          <path d="M244 61a21 21 0 0 0 24 25" strokeWidth="2.5" opacity=".36" />
          <path d="m286 35 7-3-2 7" strokeWidth="2.5" opacity=".7" />
        </>
      )
    case 'chemistry':
      return (
        <>
          <path
            d="M240 14h34v8h-5v20l25 28a6 6 0 0 1-5 10h-64a6 6 0 0 1-5-10l25-28V22h-5Z"
            fill="currentColor"
            stroke="none"
            opacity=".2"
          />
          <path d="M240 14h34v8h-5v20l25 28a6 6 0 0 1-5 10h-64a6 6 0 0 1-5-10l25-28V22h-5" strokeWidth="2.5" opacity=".78" />
          <path d="M228 64c12-8 24 6 37 0 9-4 17-1 25 5l4 5a4 4 0 0 1-4 6h-66a4 4 0 0 1-3-6Z" fill="currentColor" stroke="none" opacity=".72" />
          <circle cx="258" cy="54" r="4" fill="currentColor" stroke="none" opacity=".68" />
          <circle cx="286" cy="26" r="6" fill="currentColor" stroke="none" opacity=".32" />
          <circle cx="300" cy="16" r="3" fill="currentColor" stroke="none" opacity=".72" />
        </>
      )
    case 'biology':
      return (
        <>
          <path
            d="M215 68c7-36 31-54 78-54-3 42-28 61-78 54Z"
            fill="currentColor"
            stroke="none"
            opacity=".3"
          />
          <path
            d="M252 75c8-24 26-35 55-31-5 28-23 39-55 31Z"
            fill="currentColor"
            stroke="none"
            opacity=".62"
          />
          <path d="M216 68c22-18 44-34 69-46M239 49l1-17m11 8 19-4m-36 18 17 10M254 74c15-10 29-18 46-24" strokeWidth="2.5" opacity=".72" />
          <circle cx="296" cy="72" r="7" fill="currentColor" stroke="none" opacity=".25" />
          <circle cx="296" cy="72" r="2.5" fill="currentColor" stroke="none" opacity=".82" />
        </>
      )
    case 'astronomy':
      return (
        <>
          <path
            d="M264 11a33 33 0 1 0 26 54 27 27 0 0 1-26-54Z"
            fill="currentColor"
            stroke="none"
            opacity=".78"
          />
          <path d="M209 77c24-14 51-14 80 0 11 5 21 7 31 5v16c-14 0-27-4-39-10-25-12-47-11-67 1Z" fill="currentColor" stroke="none" opacity=".16" />
          <path d="m295 18 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm15 33 2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2Z" fill="currentColor" stroke="none" opacity=".88" />
          <circle cx="280" cy="52" r="3.5" fill="currentColor" stroke="none" opacity=".38" />
        </>
      )
    case 'earth':
      return (
        <>
          <circle cx="267" cy="42" r="31" fill="currentColor" stroke="none" opacity=".19" />
          <circle cx="267" cy="42" r="31" strokeWidth="2.5" opacity=".72" />
          <path d="M238 35h58M239 49h56M253 14c-8 17-8 37 0 55m28-55c8 17 8 37 0 55" strokeWidth="2" opacity=".36" />
          <path d="m247 21 12 3 5 10-7 7-12-3-6-7Zm33 24 13 4-5 11-8 7-9-8 2-9Z" fill="currentColor" stroke="none" opacity=".72" />
          <path d="M306 50c-7 0-12 5-12 12 0 9 12 21 12 21s12-12 12-21c0-7-5-12-12-12Z" fill="currentColor" stroke="none" opacity=".78" />
          <circle cx="306" cy="62" r="4" fill="currentColor" stroke="none" opacity=".28" />
        </>
      )
    case 'classroom':
      return (
        <>
          <rect x="219" y="18" width="82" height="46" rx="7" fill="currentColor" stroke="none" opacity=".22" />
          <rect x="219" y="18" width="82" height="46" rx="7" strokeWidth="2.5" opacity=".76" />
          <path d="M231 33h36M231 43h55" strokeWidth="3" opacity=".56" />
          <path d="M244 64v10m33-10v10" strokeWidth="3" opacity=".56" />
          <path d="M224 71h37l-4-13h-29Zm42 0h40l-4-13h-32Z" fill="currentColor" stroke="none" opacity=".76" />
          <path d="M230 71v7m26-7v7m16-7v7m28-7v7" strokeWidth="3" opacity=".46" />
          <rect x="284" y="25" width="10" height="14" rx="2" fill="currentColor" stroke="none" opacity=".7" />
        </>
      )
    case 'thai':
      return (
        <>
          <path d="M207 18h86a9 9 0 0 1 9 9v43a9 9 0 0 1-9 9h-67l-19 14 5-14h-5a9 9 0 0 1-9-9V27a9 9 0 0 1 9-9Z" fill="currentColor" stroke="none" opacity=".18" />
          <text
            x="248"
            y="68"
            fill="currentColor"
            stroke="none"
            fontFamily="var(--font-sans), sans-serif"
            fontSize="58"
            fontWeight="700"
            aria-hidden="true"
          >
            ก
          </text>
          <path d="m286 58 16-25 8 5-16 25-11 7Z" fill="currentColor" stroke="none" opacity=".76" />
          <path d="m283 70 11-7-8-5Z" fill="currentColor" stroke="none" opacity=".34" />
          <path d="M224 75c20-5 40-5 59 0" strokeWidth="2.5" opacity=".4" />
        </>
      )
    case 'foreign-language':
      return (
        <>
          <path d="M205 17h58a11 11 0 0 1 11 11v27a11 11 0 0 1-11 11h-24l-18 14 5-14h-21a11 11 0 0 1-11-11V28a11 11 0 0 1 11-11Z" fill="currentColor" stroke="none" opacity=".28" />
          <path d="M254 34h46a11 11 0 0 1 11 11v24a11 11 0 0 1-11 11h-8l5 13-18-13h-25a11 11 0 0 1-11-11V45a11 11 0 0 1 11-11Z" fill="currentColor" stroke="none" opacity=".72" />
          <text x="218" y="51" fill="currentColor" stroke="none" fontFamily="var(--font-sans), sans-serif" fontSize="22" fontWeight="700">A</text>
          <text x="272" y="67" fill="currentColor" stroke="none" fontFamily="var(--font-sans), sans-serif" fontSize="23" fontWeight="700">ก</text>
          <path d="M242 34h20m-52 20h31m55 2h8m-43 15h11" strokeWidth="3" opacity=".58" />
          <circle cx="299" cy="22" r="5" fill="currentColor" stroke="none" opacity=".24" />
        </>
      )
    case 'social-studies':
      return (
        <>
          <circle cx="236" cy="35" r="10" fill="currentColor" stroke="none" opacity=".46" />
          <circle cx="266" cy="25" r="12" fill="currentColor" stroke="none" opacity=".78" />
          <circle cx="296" cy="35" r="10" fill="currentColor" stroke="none" opacity=".46" />
          <path d="M218 67c2-15 9-23 18-23s16 8 18 23Zm24-4c2-19 11-29 24-29s22 10 24 29Zm36 4c2-15 9-23 18-23s16 8 18 23Z" fill="currentColor" stroke="none" opacity=".62" />
          <path d="M224 76h91" strokeWidth="4" opacity=".28" />
          <circle cx="236" cy="76" r="6" fill="currentColor" stroke="none" opacity=".76" />
          <circle cx="271" cy="76" r="6" fill="currentColor" stroke="none" opacity=".4" />
          <circle cx="306" cy="76" r="6" fill="currentColor" stroke="none" opacity=".76" />
        </>
      )
    case 'physical-education':
      return (
        <>
          <path d="M226 76c28-21 59-25 94-14v18c-34-13-62-9-86 11Z" fill="currentColor" stroke="none" opacity=".18" />
          <path d="M234 70c27-16 54-19 82-10M243 83c23-10 47-11 73-3" strokeWidth="3" opacity=".46" />
          <circle cx="273" cy="17" r="9" fill="currentColor" stroke="none" opacity=".88" />
          <path d="m267 30-16 20 21 8 15 25m-28-42 21 7 18-16m-26 26-24 24" strokeWidth="7" opacity=".78" />
          <path d="M222 35h20m-28 12h22" strokeWidth="4" opacity=".3" />
          <path d="m307 17 4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="currentColor" stroke="none" opacity=".32" />
        </>
      )
    case 'korkru-deer':
      return korKruDeerPattern()
  }
}

function korKruDeerPattern() {
  return (
    <g transform="translate(235 -2) scale(.105) translate(-366 -98)">
      <path d={KORKRU_DEER_BODY_PATH} fill="currentColor" stroke="none" opacity=".78" fillRule="evenodd" />
      <path d={KORKRU_DEER_ACCENT_PATH} fill="currentColor" stroke="none" opacity=".42" fillRule="evenodd" />
    </g>
  )
}

// Exact geometry from the approved KorKru mark in public/brand/deer-mark.svg.
const KORKRU_DEER_BODY_PATH = 'M395 178C399.5 177.5 409.33 178 414 179C418.67 180 420.33 182 423 184C425.67 186 428.5 189 430 191C431.5 193 431.33 195.5 432 196C432.67 196.5 434.5 189.83 434 194C433.5 198.17 429.83 213 429 221C428.17 229 428.5 235.17 429 242C429.5 248.83 429.33 252.67 432 262C434.67 271.33 440.83 288.67 445 298C449.17 307.33 453.17 312.33 457 318C460.83 323.67 461.67 325.5 468 332C474.33 338.5 485.5 349.67 495 357C504.5 364.33 513.33 369.83 525 376C536.67 382.17 551.5 388.83 565 394C578.5 399.17 598.67 404.83 606 407C613.33 409.17 608.5 407.33 609 407C609.5 406.67 610.33 410.17 609 405C607.67 399.83 602.5 386 601 376C599.5 366 599.33 354.83 600 345C600.67 335.17 602.83 325.33 605 317C607.17 308.67 609.17 303 613 295C616.83 287 622 277.17 628 269C634 260.83 643.5 250.83 649 246C654.5 241.17 657 241 661 240C665 239 669.67 239.33 673 240C676.33 240.67 678.67 241.83 681 244C683.33 246.17 685.83 249.83 687 253C688.17 256.17 688.5 259.5 688 263C687.5 266.5 686 270.5 684 274C682 277.5 678.67 279.67 676 284C673.33 288.33 670.67 293 668 300C665.33 307 661.67 318 660 326C658.33 334 657.83 340.33 658 348C658.17 355.67 659.33 364.5 661 372C662.67 379.5 664.5 385 668 393C671.5 401 673.33 407.33 682 420C690.67 432.67 711.5 457 720 469C728.5 481 729.5 484.5 733 492C736.5 499.5 739 506.83 741 514C743 521.17 744.33 529.67 745 535C745.67 540.33 740.5 542.33 745 546C749.5 549.67 763.83 552.67 772 557C780.17 561.33 787.67 566.83 794 572C800.33 577.17 803.67 579.67 810 588C816.33 596.33 825.17 613 832 622C838.83 631 844 636.17 851 642C858 647.83 861.33 650.33 874 657C886.67 663.67 916.5 676.33 927 682C937.5 687.67 934.67 688.17 937 691C939.33 693.83 940.17 694.5 941 699C941.83 703.5 942.67 711.33 942 718C941.33 724.67 939.5 732.17 937 739C934.5 745.83 931.17 752.83 927 759C922.83 765.17 916.83 771.5 912 776C907.17 780.5 903.67 783 898 786C892.33 789 896.67 791.17 878 794C859.33 796.83 805.33 800.5 786 803C766.67 805.5 768.83 806.67 762 809C755.17 811.33 750.67 813.17 745 817C739.33 820.83 732.17 827.17 728 832C723.83 836.83 722.17 840.67 720 846C717.83 851.33 716 856.83 715 864C714 871.17 714.5 884.83 714 889C713.5 893.17 715 892.33 712 889C709 885.67 699.83 875.83 696 869C692.17 862.17 690.17 854.83 689 848C687.83 841.17 688.67 832.83 689 828C689.33 823.17 689 823.5 691 819C693 814.5 697.17 806.17 701 801C704.83 795.83 709.83 791.5 714 788C718.17 784.5 718.5 783.5 726 780C733.5 776.5 747.17 770.33 759 767C770.83 763.67 781 761.83 797 760C813 758.17 842.5 757.5 855 756C867.5 754.5 867.33 753.17 872 751C876.67 748.83 879.83 746.5 883 743C886.17 739.5 889.33 733.33 891 730C892.67 726.67 892.67 725.67 893 723C893.33 720.33 893.33 716.33 893 714C892.67 711.67 892.67 711 891 709C889.33 707 892.17 706.67 883 702C873.83 697.33 847 686.67 836 681C825 675.33 822.67 672.5 817 668C811.33 663.5 807.5 660.67 802 654C796.5 647.33 789.83 635.33 784 628C778.17 620.67 774.5 616 767 610C759.5 604 746.5 596 739 592C731.5 588 728.67 587.67 722 586C715.33 584.33 714 582.83 699 582C684 581.17 648.17 582.17 632 581C615.83 579.83 611.67 578.33 602 575C592.33 571.67 584.67 569 574 561C563.33 553 549.33 536 538 527C526.67 518 517.5 512.5 506 507C494.5 501.5 480 497 469 494C458 491 446.83 489.83 440 489C433.17 488.17 429.17 485.83 428 489C426.83 492.17 430.5 501.33 433 508C435.5 514.67 439.33 522.67 443 529C446.67 535.33 450.5 540.67 455 546C459.5 551.33 465.33 557 470 561C474.67 565 477.83 567 483 570C488.17 573 495 576.5 501 579C507 581.5 509.83 582.67 519 585C528.17 587.33 545.67 589.83 556 593C566.33 596.17 573.33 599.17 581 604C588.67 608.83 597.33 617.33 602 622C606.67 626.67 606.5 627.5 609 632C611.5 636.5 614.67 641.5 617 649C619.33 656.5 622 667.67 623 677C624 686.33 624 695.33 623 705C622 714.67 619.67 725.5 617 735C614.33 744.5 610.33 754.17 607 762C603.67 769.83 602.5 772.5 597 782C591.5 791.5 581.33 806.17 574 819C566.67 831.83 558.33 846.17 553 859C547.67 871.83 544.17 883.5 542 896C539.83 908.5 539.83 924 540 934C540.17 944 541.67 949.17 543 956C544.33 962.83 546 968.67 548 975C550 981.33 551.83 986.83 555 994C558.17 1001.17 562.17 1009.67 567 1018C571.83 1026.33 579 1037.33 584 1044C589 1050.67 594.83 1055.33 597 1058C599.17 1060.67 595.33 1058.17 597 1060C598.67 1061.83 605.33 1067.17 607 1069C608.67 1070.83 602.67 1066.67 607 1071C611.33 1075.33 623.67 1087.5 633 1095C642.33 1102.5 657.5 1111.5 663 1116C668.5 1120.5 665.5 1119.5 666 1122C666.5 1124.5 667.5 1128.17 666 1131C664.5 1133.83 659.67 1137.67 657 1139C654.33 1140.33 653.83 1139.83 650 1139C646.17 1138.17 641.33 1137 634 1134C626.67 1131 615 1125.83 606 1121C597 1116.17 587.83 1110.33 580 1105C572.17 1099.67 568.5 1097.83 559 1089C549.5 1080.17 531.5 1061.67 523 1052C514.5 1042.33 513 1039.33 508 1031C503 1022.67 497 1011.17 493 1002C489 992.83 486.5 985.5 484 976C481.5 966.5 479 956 478 945C477 934 477.33 920 478 910C478.67 900 478.83 896.5 482 885C485.17 873.5 492 853.17 497 841C502 828.83 504.5 824.83 512 812C519.5 799.17 534.5 777.17 542 764C549.5 750.83 553.5 741.33 557 733C560.5 724.67 561.5 720.5 563 714C564.5 707.5 565.83 701.33 566 694C566.17 686.67 565.5 676.83 564 670C562.5 663.17 560.17 658 557 653C553.83 648 550.5 643.83 545 640C539.5 636.17 534.5 633.67 524 630C513.5 626.33 492.83 621.83 482 618C471.17 614.17 466.67 611.5 459 607C451.33 602.5 443.17 597 436 591C428.83 585 421.83 577.83 416 571C410.17 564.17 405.83 558.17 401 550C396.17 541.83 391.17 532.5 387 522C382.83 511.5 378.83 499.67 376 487C373.17 474.33 370.5 453.83 370 446C369.5 438.17 371.5 441.67 373 440C374.5 438.33 373.17 436.67 379 436C384.83 435.33 394.67 435 408 436C421.33 437 443 439 459 442C475 445 491.17 449.5 504 454C516.83 458.5 528.33 465 536 469C543.67 473 539.17 469 550 478C560.83 487 590.5 514.5 601 523C611.5 531.5 608.33 527.33 613 529C617.67 530.67 622.33 532.33 629 533C635.67 533.67 646.83 533.67 653 533C659.17 532.33 662.67 531.17 666 529C669.33 526.83 672 523.83 673 520C674 516.17 673.83 510.67 672 506C670.17 501.33 668 497.17 662 492C656 486.83 656.17 483.17 636 475C615.83 466.83 565.67 452.5 541 443C516.33 433.5 502 425.67 488 418C474 410.33 468 406.17 457 397C446 387.83 430.5 372.33 422 363C413.5 353.67 411 349 406 341C401 333 395.83 323.33 392 315C388.17 306.67 385.5 299.67 383 291C380.5 282.33 378.33 273 377 263C375.67 253 374.83 241.17 375 231C375.17 220.83 376.5 210.5 378 202C379.5 193.5 382.5 183.33 384 180C385.5 176.67 385.17 182.33 387 182C388.83 181.67 390.5 178.5 395 178Z'
const KORKRU_DEER_ACCENT_PATH = 'M445 102C448.67 101.5 452.67 101.83 456 103C459.33 104.17 462.83 106.83 465 109C467.17 111.17 468.33 112.67 469 116C469.67 119.33 469.67 125.5 469 129C468.33 132.5 467 134.33 465 137C463 139.67 460.17 140.83 457 145C453.83 149.17 449.17 156.33 446 162C442.83 167.67 440.17 173.33 438 179C435.83 184.67 435.5 195.17 433 196C430.5 196.83 426.17 186.83 423 184C419.83 181.17 418.67 180 414 179C409.33 178 399.83 177.5 395 178C390.17 178.5 385.83 184 385 182C384.17 180 385.83 174.5 390 166C394.17 157.5 402.67 141 410 131C417.33 121 428.17 110.83 434 106C439.83 101.17 441.33 102.5 445 102Z'
