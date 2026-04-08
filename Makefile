all: ky_linear_algebra.mac mcq_template_pre.mac mcq_template_post.mac mcq_template_fvar.mac

.mac: .txt
	./10txt2mac.sh o
TXTFILES := mcq_template_pre.txt mcq_template_post.txt mcq_template_fvar.txt \
		ky_linear_algebra.txt mcq_flags.txt tex_library.txt 
MACFILES := $(TXTFILES:.txt=.mac)

.PHONY: all clean

all: $(MACFILES)

%.mac: %.txt 10txt2mac.sh
	./10txt2mac.sh $< > $@

clean:
	rm -f $(MACFILES)
