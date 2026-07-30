# 图解网络介绍

## 目录

- [适合什么群体？](#适合什么群体)
- [要怎么阅读？](#要怎么阅读)
- [质量如何？](#质量如何)
- [有错误怎么办？](#有错误怎么办)

---

大家好，我是小林，是《[图解网络](https://mp.weixin.qq.com/mp/appmsgalbum?action=getalbum&amp;album_id=1337204681134751744&amp;__biz=MzUxODAzNDg4NQ==#wechat_redirect)》的作者，这是一份专注计算机网络学习与面试的开源资料，内容都是整理于我的[公众号](https://mp.weixin.qq.com/s/q2l8HwJHIAMrDiWiMibYnA)里的图解网络的文章。

简单介绍下《[图解网络](https://mp.weixin.qq.com/mp/appmsgalbum?action=getalbum&amp;album_id=1337204681134751744&amp;__biz=MzUxODAzNDg4NQ==#wechat_redirect)》，整个内容共有 `20W` 字 + `500` 张图，每一篇都自己手绘了很多图，目的也很简单，想通过「说人话+图解」的方式，击破大家对于「八股文」的恐惧。

## 适合什么群体？

《图解网络》写的网络知识主要是面向程序员的，因为小林本身也是个程序员，所以涉及到的知识主要是关于程序员日常工作或者面试的网络知识。

非常适合有一点网络基础，但是又不怎么扎实，或者知识点串不起来的同学，说白这本图解网络就是为了拯救半桶水的同学而出来的。

因为小林写的图解网络就四个字，通俗易懂！

相信你在看这本图解网络的时候，你心里的感受会是：

- 「卧槽，原来是这样，大学老师教知识原来是这么理解」
- 「卧槽，我的网络知识串起来了」
- 「卧槽，我感觉面试稳了」
- 「卧槽，相见恨晚」

当然，也适合面试突击网络知识时拿来看。图解网络里的内容基本是面试常见的协议，比如 HTTP、HTTPS、TCP、UDP、IP 等等，也有很多面试常问的问题，比如：

- TCP 为什么三次握手？四次挥手？
- TCP 为什么要有 TIME_WAIT 状态？
- TCP 为什么是可靠传输协议，而 UDP 不是？
- 键入网址到网页显示，期间发生了什么？
- HTTPS 握手过程是怎样的？
- ….

不敢说 100 % 涵盖了面试的网络问题，但是至少 90% 是有的，而且内容的深度应对大厂也是绰绰有余，有非常多的读者跑来感激小林的图解网络，帮助他们拿到了国内很多一线大厂的 offer。

## 要怎么阅读？

很诚恳的告诉你，《图解网络》不是教科书，而是我写的图解网络文章的整合，所以肯定是没有教科书那么细致和全面，当然也就不会有很多废话，都是直击重点，不绕弯，而且有的知识点书上看不到。

阅读的顺序可以不用从头读到尾，你可以根据你想要了解的知识点，通过本站的搜索功能，去看哪个章节的内容就好，可以随意阅读任何章节。

《图解网络》目录结构如下（别看篇章不多，每一章都是很长很长的文章哦 ）：

- 网络基础篇 
  - [TCP/IP 网络模型有哪几层？](https://xiaolincoding.com/network/1_base/tcp_ip_model.html)
  - [键入网址到网页显示，期间发生了什么？](https://xiaolincoding.com/network/1_base/what_happen_url.html)
  - [Linux 系统是如何收发网络包的？](https://xiaolincoding.com/network/1_base/how_os_deal_network_package.html)
- HTTP 篇 
  - [HTTP 常见面试题](https://xiaolincoding.com/network/2_http/http_interview.html)
  - [HTTP/1.1如何优化？](https://xiaolincoding.com/network/2_http/http_optimize.html)
  - [HTTPS RSA 握手解析](https://xiaolincoding.com/network/2_http/https_rsa.html)
  - [HTTPS ECDHE 握手解析](https://xiaolincoding.com/network/2_http/https_ecdhe.html)
  - [HTTPS 如何优化？](https://xiaolincoding.com/network/2_http/https_optimize.html)
  - [HTTP/2 牛逼在哪？](https://xiaolincoding.com/network/2_http/http2.html)
  - [HTTP/3 强势来袭](https://xiaolincoding.com/network/2_http/http3.html)
  - [既然有 HTTP 协议，为什么还要有 RPC？](https://xiaolincoding.com/network/2_http/http_rpc.html)
  - [既然有 HTTP 协议，为什么还要有 WebSocket？](https://xiaolincoding.com/network/2_http/http_websocket.html)
- TCP 篇 
  - [TCP 三次握手与四次挥手面试题](https://xiaolincoding.com/network/3_tcp/tcp_interview.html)
  - [TCP 重传、滑动窗口、流量控制、拥塞控制](https://xiaolincoding.com/network/3_tcp/tcp_feature.html)
  - [TCP 实战抓包分析](https://xiaolincoding.com/network/3_tcp/tcp_tcpdump.html)
  - [TCP 半连接队列和全连接队列](https://xiaolincoding.com/network/3_tcp/tcp_queue.html)
  - [如何优化 TCP?](https://xiaolincoding.com/network/3_tcp/tcp_optimize.html)
  - [如何理解是 TCP 面向字节流协议？](https://xiaolincoding.com/network/3_tcp/tcp_stream.html)
  - [为什么 TCP 每次建立连接时，初始化序列号都要不一样呢？](https://xiaolincoding.com/network/3_tcp/isn_deff.html)
  - [SYN 报文什么情况下会被丢弃？](https://xiaolincoding.com/network/3_tcp/syn_drop.html)
  - [已建立连接的 TCP，收到 SYN 会发生什么？](https://xiaolincoding.com/network/3_tcp/challenge_ack.html)
  - [四次挥手中收到乱序的 FIN 包会如何处理？](https://xiaolincoding.com/network/3_tcp/out_of_order_fin.html)
  - [在 TIME_WAIT 状态的 TCP 连接，收到 SYN 后会发生什么？](https://xiaolincoding.com/network/3_tcp/time_wait_recv_syn.html)
  - [TCP 连接，一端断电和进程崩溃有什么区别？](https://xiaolincoding.com/network/3_tcp/tcp_down_and_crash.html)
  - [拔掉网线后， 原本的 TCP 连接还存在吗？](https://xiaolincoding.com/network/3_tcp/tcp_unplug_the_network_cable.html)
  - [tcp_tw_reuse 为什么默认是关闭的？](https://xiaolincoding.com/network/3_tcp/tcp_tw_reuse_close.html)
  - [HTTPS 中 TLS 和 TCP 能同时握手吗？](https://xiaolincoding.com/network/3_tcp/tcp_tls.html)
  - [TCP Keepalive 和 HTTP Keep-Alive 是一个东西吗？](https://xiaolincoding.com/network/3_tcp/tcp_http_keepalive.html)
  - [TCP 有什么缺陷？](https://xiaolincoding.com/network/3_tcp/tcp_problem.html)
  - [如何基于 UDP 协议实现可靠传输？](https://xiaolincoding.com/network/3_tcp/quic.html)
  - [TCP 和 UDP 可以使用同一个端口吗？](https://xiaolincoding.com/network/3_tcp/port.html)
  - [服务端没有 listen，客户端发起连接建立，会发生什么？](https://xiaolincoding.com/network/3_tcp/tcp_no_listen.html)
  - [没有 accept，可以建立 TCP 连接吗？](https://xiaolincoding.com/network/3_tcp/tcp_no_accpet.html)
  - [用了 TCP 协议，数据一定不会丢吗？](https://xiaolincoding.com/network/3_tcp/tcp_drop.html)
  - [TCP 四次挥手，可以变成三次吗？](https://xiaolincoding.com/network/3_tcp/tcp_three_fin.html)
  - [TCP 序列号和确认号是如何变化的？](https://xiaolincoding.com/network/3_tcp/tcp_seq_ack.html)
- IP 篇 
  - [IP 基础知识全家桶](https://xiaolincoding.com/network/4_ip/ip_base.html)
  - [ping 的工作原理](https://xiaolincoding.com/network/4_ip/ping.html)
  - [断网了，还能 ping 通 127.0.0.1 吗？](https://xiaolincoding.com/network/4_ip/ping_lo.html)
- 学习心得 
  - [计算机网络怎么学？](https://xiaolincoding.com/network/5_learn/learn_network.html)
  - [画图经验分享](https://xiaolincoding.com/network/5_learn/draw.html)

## 质量如何？

图解网络的质量小林说的不算，读者说的算！

图解网络的第一个版本自去年发布以来，每隔一段时间，就会有不少的读者跑来感激小林。

他们说看了我的图解网络，轻松应对大厂的网络面试题，而且每次面试时问到网络问题，他们一点都不慌，甚至暗暗窃喜。


## 有错误怎么办？

小林是个手残党，时常写出错别字。

如果你在学习的过程中，如果你发现有任何错误或者疑惑的地方，欢迎你通过以下方式给我反馈：

- 登记飞书表格：[小林图解网站问题反馈登记](https://icnaxnmh86kx.feishu.cn/share/base/form/shrcneQ2yqySZ7s74EfiVKFDdwv)（推荐）

小林抽时间会逐个修正，然后发布新版本的图解网络 PDF，一起迭代出更好的图解网络！
